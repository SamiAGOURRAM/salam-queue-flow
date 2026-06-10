-- Extend medical sharing with explicit scope controls and procedure-report artifact coverage.
-- This migration adds:
-- 1) explicit scope normalization during access request creation,
-- 2) shared-history/detail payload support for visible procedure reports and report images,
-- 3) patient-safe read policies for visible report image metadata and storage objects.

CREATE OR REPLACE FUNCTION public._medical_normalize_scope(
  p_scope JSONB,
  p_default_appointment_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_scope JSONB := COALESCE(p_scope, '{}'::jsonb);
  v_scope_type TEXT;
  v_from DATE;
  v_to DATE;
  v_appointment_ids JSONB := '[]'::jsonb;
BEGIN
  v_scope_type := COALESCE(NULLIF(v_scope->>'type', ''), 'specific_appointments');

  IF v_scope_type NOT IN ('full_history', 'date_range', 'specific_appointments') THEN
    RAISE EXCEPTION 'Invalid scope type %', v_scope_type;
  END IF;

  IF v_scope_type = 'full_history' THEN
    RETURN '{"type":"full_history"}'::jsonb;
  END IF;

  IF v_scope_type = 'date_range' THEN
    v_from := NULLIF(v_scope->>'from', '')::date;
    v_to := NULLIF(v_scope->>'to', '')::date;

    IF v_from IS NULL OR v_to IS NULL THEN
      RAISE EXCEPTION 'date_range scope requires from and to dates';
    END IF;

    IF v_to < v_from THEN
      RAISE EXCEPTION 'date_range scope has invalid bounds';
    END IF;

    RETURN jsonb_build_object(
      'type', 'date_range',
      'from', to_char(v_from, 'YYYY-MM-DD'),
      'to', to_char(v_to, 'YYYY-MM-DD')
    );
  END IF;

  SELECT COALESCE(jsonb_agg(to_jsonb(appointment_id_text)), '[]'::jsonb)
  INTO v_appointment_ids
  FROM (
    SELECT elem AS appointment_id_text
    FROM jsonb_array_elements_text(COALESCE(v_scope->'appointment_ids', '[]'::jsonb)) e(elem)
    WHERE elem ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  ) valid_ids;

  IF jsonb_array_length(v_appointment_ids) = 0 THEN
    IF p_default_appointment_id IS NULL THEN
      RAISE EXCEPTION 'specific_appointments scope requires at least one appointment id';
    END IF;

    v_appointment_ids := jsonb_build_array(p_default_appointment_id::text);
  END IF;

  RETURN jsonb_build_object(
    'type', 'specific_appointments',
    'appointment_ids', v_appointment_ids
  );
END;
$$;


CREATE OR REPLACE FUNCTION public.request_medical_record_access(
  p_patient_id UUID,
  p_appointment_id UUID,
  p_clinic_id UUID,
  p_owner_override_reason TEXT,
  p_scope JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_patient public.patients%ROWTYPE;
  v_appointment public.appointments%ROWTYPE;
  v_staff_user_id UUID;
  v_is_assigned_doctor BOOLEAN;
  v_is_owner BOOLEAN;
  v_active_grant public.medical_record_access_grants%ROWTYPE;
  v_pending_grant public.medical_record_access_grants%ROWTYPE;
  v_grant public.medical_record_access_grants%ROWTYPE;
  v_resolved RECORD;
  v_scope JSONB;
BEGIN
  v_user_id := public._medical_assert_authenticated();

  IF p_patient_id IS NULL OR p_appointment_id IS NULL OR p_clinic_id IS NULL THEN
    RAISE EXCEPTION 'patient_id, appointment_id, and clinic_id are required';
  END IF;

  IF NOT public._user_can_manage_clinic(p_clinic_id, v_user_id) THEN
    RAISE EXCEPTION 'You are not allowed to request access for this clinic' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_appointment
  FROM public.appointments a
  WHERE a.id = p_appointment_id
    AND a.patient_id = p_patient_id
    AND a.clinic_id = p_clinic_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Appointment context mismatch';
  END IF;

  IF v_appointment.status <> 'in_progress' THEN
    RAISE EXCEPTION 'Medical record access can only be requested during in-progress appointments';
  END IF;

  SELECT cs.user_id INTO v_staff_user_id
  FROM public.clinic_staff cs
  WHERE cs.id = v_appointment.staff_id;

  v_is_assigned_doctor := (v_staff_user_id = v_user_id);
  v_is_owner := public._medical_is_clinic_owner(v_user_id, p_clinic_id);

  IF NOT v_is_assigned_doctor THEN
    IF NOT v_is_owner OR COALESCE(btrim(p_owner_override_reason), '') = '' THEN
      RAISE EXCEPTION 'Only assigned doctor may request access unless clinic owner override reason is provided' USING ERRCODE = '42501';
    END IF;
  END IF;

  SELECT * INTO v_patient
  FROM public.patients p
  WHERE p.id = p_patient_id
    AND NOT p.is_anonymized;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Patient not found or anonymized';
  END IF;

  v_scope := public._medical_normalize_scope(p_scope, p_appointment_id);

  SELECT * INTO v_active_grant
  FROM public.medical_record_access_grants g
  WHERE g.patient_id = p_patient_id
    AND g.grantee_user_id = v_user_id
    AND g.status = 'active'
    AND g.expires_at > NOW()
    AND g.revoked_at IS NULL
  ORDER BY g.created_at DESC
  LIMIT 1;

  IF FOUND THEN
    SELECT * INTO v_resolved
    FROM public._medical_resolve_delivery_channel(p_patient_id)
    LIMIT 1;

    RETURN jsonb_build_object(
      'grant_id', v_active_grant.id,
      'delivery_channel', COALESCE(v_resolved.delivery_channel, 'sms'),
      'patient_has_app', COALESCE(v_resolved.patient_has_app, false),
      'delivery_status', 'sent',
      'otp_ttl_seconds', 300,
      'has_access', true,
      'expires_at', v_active_grant.expires_at,
      'scope', v_active_grant.scope
    );
  END IF;

  SELECT * INTO v_pending_grant
  FROM public.medical_record_access_grants g
  WHERE g.patient_id = p_patient_id
    AND g.grantee_user_id = v_user_id
    AND g.status = 'pending_otp'
  ORDER BY g.created_at DESC
  LIMIT 1;

  IF FOUND THEN
    IF v_pending_grant.created_at < NOW() - INTERVAL '30 minutes' THEN
      UPDATE public.medical_record_access_grants
      SET status = 'expired',
          updated_at = NOW()
      WHERE id = v_pending_grant.id;
      v_pending_grant := NULL;
    END IF;
  END IF;

  IF v_pending_grant.id IS NULL THEN
    INSERT INTO public.medical_record_access_grants (
      patient_id,
      grantee_user_id,
      clinic_id,
      appointment_id,
      owner_override_reason,
      status,
      scope
    ) VALUES (
      p_patient_id,
      v_user_id,
      p_clinic_id,
      p_appointment_id,
      NULLIF(btrim(p_owner_override_reason), ''),
      'pending_otp',
      v_scope
    )
    RETURNING * INTO v_grant;
  ELSE
    UPDATE public.medical_record_access_grants
    SET scope = v_scope,
        clinic_id = p_clinic_id,
        appointment_id = p_appointment_id,
        owner_override_reason = NULLIF(btrim(p_owner_override_reason), ''),
        updated_at = NOW()
    WHERE id = v_pending_grant.id
    RETURNING * INTO v_grant;
  END IF;

  SELECT * INTO v_resolved
  FROM public._medical_resolve_delivery_channel(p_patient_id)
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'error', 'no_contact_channel',
      'message', 'Patient has no phone or email on file',
      'grant_id', v_grant.id
    );
  END IF;

  PERFORM public._medical_insert_audit_log(
    v_user_id,
    p_clinic_id,
    'medical_record_grant',
    v_grant.id,
    'request',
    jsonb_build_object(
      'appointment_id', p_appointment_id,
      'patient_id', p_patient_id,
      'delivery_channel', v_resolved.delivery_channel,
      'owner_override_reason', NULLIF(btrim(p_owner_override_reason), ''),
      'scope', v_scope
    )
  );

  RETURN jsonb_build_object(
    'grant_id', v_grant.id,
    'delivery_channel', v_resolved.delivery_channel,
    'patient_has_app', v_resolved.patient_has_app,
    'delivery_status', 'pending',
    'otp_ttl_seconds', 300,
    'scope', v_grant.scope
  );
END;
$$;


CREATE OR REPLACE FUNCTION public.request_medical_record_access(
  p_patient_id UUID,
  p_appointment_id UUID,
  p_clinic_id UUID,
  p_owner_override_reason TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN public.request_medical_record_access(
    p_patient_id,
    p_appointment_id,
    p_clinic_id,
    p_owner_override_reason,
    NULL
  );
END;
$$;


CREATE OR REPLACE FUNCTION public.get_shared_appointment_history(
  p_grant_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_grant public.medical_record_access_grants%ROWTYPE;
  v_patient_display_name TEXT;
BEGIN
  v_user_id := public._medical_assert_authenticated();

  SELECT * INTO v_grant
  FROM public.medical_record_access_grants g
  WHERE g.id = p_grant_id
    AND g.grantee_user_id = v_user_id
    AND g.status = 'active'
    AND g.expires_at > NOW()
    AND g.revoked_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Active grant not found or expired' USING ERRCODE = '42501';
  END IF;

  SELECT p.display_name INTO v_patient_display_name
  FROM public.patients p
  WHERE p.id = v_grant.patient_id;

  INSERT INTO public.medical_record_access_log (
    grant_id,
    accessed_by,
    patient_id,
    patient_pseudonym,
    clinic_id,
    record_type,
    action
  ) VALUES (
    v_grant.id,
    v_user_id,
    v_grant.patient_id,
    COALESCE(v_patient_display_name, 'Patient'),
    v_grant.clinic_id,
    'appointment_history',
    'list'
  );

  RETURN COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'appointment_id', a.id,
      'date', a.appointment_date,
      'clinic_name', c.name,
      'doctor_name', COALESCE(pr.full_name, 'Staff Member'),
      'appointment_type', a.appointment_type,
      'status', a.status,
      'has_diagnoses', EXISTS (
        SELECT 1 FROM public.medical_record_diagnoses d
        WHERE d.appointment_id = a.id AND d.is_patient_visible = true
      ),
      'has_notes', COALESCE(NULLIF(btrim(a.notes), ''), NULL) IS NOT NULL,
      'has_prescriptions', EXISTS (
        SELECT 1 FROM public.medical_record_prescriptions p
        WHERE p.appointment_id = a.id AND p.is_patient_visible = true
      ),
      'has_lab_results', EXISTS (
        SELECT 1 FROM public.medical_record_lab_results l
        WHERE l.appointment_id = a.id AND l.is_patient_visible = true
      ),
      'has_procedure_reports', EXISTS (
        SELECT 1 FROM public.medical_procedure_reports r
        WHERE r.appointment_id = a.id AND r.is_patient_visible = true
      )
    ) ORDER BY a.appointment_date DESC, COALESCE(a.scheduled_time, '00:00') DESC)
    FROM public.appointments a
    LEFT JOIN public.clinics c ON c.id = a.clinic_id
    LEFT JOIN public.clinic_staff cs ON cs.id = a.staff_id
    LEFT JOIN public.profiles pr ON pr.id = cs.user_id
    WHERE a.patient_id = v_grant.patient_id
      AND a.status IN ('completed', 'in_progress')
      AND public._medical_scope_allows_appointment(v_grant.scope, a.id, a.appointment_date)
  ), '[]'::jsonb);
END;
$$;


CREATE OR REPLACE FUNCTION public.get_shared_appointment_detail(
  p_grant_id UUID,
  p_appointment_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_grant public.medical_record_access_grants%ROWTYPE;
  v_appointment public.appointments%ROWTYPE;
  v_patient_display_name TEXT;
BEGIN
  v_user_id := public._medical_assert_authenticated();

  SELECT * INTO v_grant
  FROM public.medical_record_access_grants g
  WHERE g.id = p_grant_id
    AND g.grantee_user_id = v_user_id
    AND g.status = 'active'
    AND g.expires_at > NOW()
    AND g.revoked_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Active grant not found or expired' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_appointment
  FROM public.appointments a
  WHERE a.id = p_appointment_id
    AND a.patient_id = v_grant.patient_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Appointment not found for granted patient';
  END IF;

  IF NOT public._medical_scope_allows_appointment(v_grant.scope, v_appointment.id, v_appointment.appointment_date) THEN
    RAISE EXCEPTION 'Appointment outside granted scope' USING ERRCODE = '42501';
  END IF;

  SELECT p.display_name INTO v_patient_display_name
  FROM public.patients p
  WHERE p.id = v_grant.patient_id;

  INSERT INTO public.medical_record_access_log (
    grant_id,
    accessed_by,
    patient_id,
    patient_pseudonym,
    clinic_id,
    record_type,
    record_id,
    action
  ) VALUES (
    v_grant.id,
    v_user_id,
    v_grant.patient_id,
    COALESCE(v_patient_display_name, 'Patient'),
    v_grant.clinic_id,
    'appointment_detail',
    p_appointment_id,
    'view'
  );

  RETURN (
    SELECT jsonb_build_object(
      'appointment_id', a.id,
      'date', a.appointment_date,
      'clinic_name', c.name,
      'doctor_name', COALESCE(pr.full_name, 'Staff Member'),
      'appointment_type', a.appointment_type,
      'status', a.status,
      'has_diagnoses', EXISTS (
        SELECT 1 FROM public.medical_record_diagnoses d
        WHERE d.appointment_id = a.id AND d.is_patient_visible = true
      ),
      'has_notes', COALESCE(NULLIF(btrim(a.notes), ''), NULL) IS NOT NULL,
      'has_prescriptions', EXISTS (
        SELECT 1 FROM public.medical_record_prescriptions p
        WHERE p.appointment_id = a.id AND p.is_patient_visible = true
      ),
      'has_lab_results', EXISTS (
        SELECT 1 FROM public.medical_record_lab_results l
        WHERE l.appointment_id = a.id AND l.is_patient_visible = true
      ),
      'has_procedure_reports', EXISTS (
        SELECT 1 FROM public.medical_procedure_reports r
        WHERE r.appointment_id = a.id AND r.is_patient_visible = true
      ),
      'reason_for_visit', a.reason_for_visit,
      'notes', a.notes,
      'duration_minutes', a.actual_duration,
      'diagnoses', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'id', d.id,
          'diagnosisCode', d.diagnosis_code,
          'diagnosisLabel', d.diagnosis_label,
          'diagnosisNotes', d.diagnosis_notes
        ) ORDER BY d.created_at DESC)
        FROM public.medical_record_diagnoses d
        WHERE d.appointment_id = a.id
          AND d.is_patient_visible = true
      ), '[]'::jsonb),
      'prescriptions', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'id', p.id,
          'medicationName', p.medication_name,
          'dosage', p.dosage,
          'route', p.route,
          'frequency', p.frequency,
          'durationDays', p.duration_days,
          'instructions', p.instructions
        ) ORDER BY p.created_at DESC)
        FROM public.medical_record_prescriptions p
        WHERE p.appointment_id = a.id
          AND p.is_patient_visible = true
      ), '[]'::jsonb),
      'lab_results', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'id', l.id,
          'testName', l.test_name,
          'resultValue', l.result_value,
          'unit', l.unit,
          'referenceRange', l.reference_range,
          'interpretation', l.interpretation
        ) ORDER BY l.created_at DESC)
        FROM public.medical_record_lab_results l
        WHERE l.appointment_id = a.id
          AND l.is_patient_visible = true
      ), '[]'::jsonb),
      'procedure_reports', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'id', r.id,
          'title', r.title,
          'status', r.status,
          'finalized_at', r.finalized_at,
          'created_at', r.created_at,
          'content_plain_text', r.content_plain_text,
          'images', COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
              'id', i.id,
              'storage_path', i.storage_path,
              'file_name', i.file_name,
              'file_size', i.file_size,
              'mime_type', i.mime_type,
              'created_at', i.created_at
            ) ORDER BY i.created_at ASC)
            FROM public.medical_report_images i
            WHERE i.report_id = r.id
          ), '[]'::jsonb)
        ) ORDER BY r.created_at DESC)
        FROM public.medical_procedure_reports r
        WHERE r.appointment_id = a.id
          AND r.is_patient_visible = true
      ), '[]'::jsonb)
    )
    FROM public.appointments a
    LEFT JOIN public.clinics c ON c.id = a.clinic_id
    LEFT JOIN public.clinic_staff cs ON cs.id = a.staff_id
    LEFT JOIN public.profiles pr ON pr.id = cs.user_id
    WHERE a.id = p_appointment_id
  );
END;
$$;


DROP POLICY IF EXISTS patient_select_visible_report_images ON public.medical_report_images;
CREATE POLICY patient_select_visible_report_images
  ON public.medical_report_images FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.medical_procedure_reports r
      JOIN public.patients p ON p.id = r.patient_id
      WHERE r.id = medical_report_images.report_id
        AND r.is_patient_visible = true
        AND p.user_id = auth.uid()
        AND NOT p.is_anonymized
    )
  );


DROP POLICY IF EXISTS patient_read_own_visible_report_images ON storage.objects;
CREATE POLICY patient_read_own_visible_report_images
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'medical-report-images'
    AND auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.medical_report_images i
      JOIN public.medical_procedure_reports r ON r.id = i.report_id
      JOIN public.patients p ON p.id = r.patient_id
      WHERE i.storage_path = storage.objects.name
        AND r.is_patient_visible = true
        AND p.user_id = auth.uid()
        AND NOT p.is_anonymized
    )
  );


GRANT EXECUTE ON FUNCTION public.request_medical_record_access(UUID, UUID, UUID, TEXT, JSONB) TO authenticated;
