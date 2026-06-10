-- Hardening updates for medical sharing:
-- 1) Enforce one open grant per (patient, grantee) pair.
-- 2) Add explicit RLS policies for diagnoses/prescriptions/lab results tables.
-- 3) Restrict walk-in revoke RPC to authenticated clinic managers.

-- ---------------------------------------------------------------------------
-- Enforce one open grant (pending_otp or active) per patient+grantee pair.
-- ---------------------------------------------------------------------------

WITH ranked AS (
  SELECT
    g.id,
    g.status,
    ROW_NUMBER() OVER (
      PARTITION BY g.patient_id, g.grantee_user_id
      ORDER BY
        CASE g.status WHEN 'active' THEN 0 ELSE 1 END,
        g.created_at DESC,
        g.id DESC
    ) AS rn
  FROM public.medical_record_access_grants g
  WHERE g.status IN ('pending_otp', 'active')
),
to_expire AS (
  SELECT id
  FROM ranked
  WHERE rn > 1
)
UPDATE public.medical_record_access_grants g
SET status = 'expired',
    updated_at = NOW(),
    revocation_reason = COALESCE(g.revocation_reason, 'superseded_open_grant')
FROM to_expire e
WHERE g.id = e.id;

DROP INDEX IF EXISTS public.idx_med_grants_unique_active_pair;
DROP INDEX IF EXISTS public.idx_med_grants_unique_open_pair;

CREATE UNIQUE INDEX idx_med_grants_unique_open_pair
  ON public.medical_record_access_grants(patient_id, grantee_user_id)
  WHERE status IN ('pending_otp', 'active');


-- ---------------------------------------------------------------------------
-- RLS policies for medical record clinical tables.
-- ---------------------------------------------------------------------------

-- Diagnoses
DROP POLICY IF EXISTS staff_select_med_diagnoses ON public.medical_record_diagnoses;
CREATE POLICY staff_select_med_diagnoses
  ON public.medical_record_diagnoses FOR SELECT
  USING (public._user_can_manage_clinic(clinic_id, auth.uid()));

DROP POLICY IF EXISTS patient_select_visible_med_diagnoses ON public.medical_record_diagnoses;
CREATE POLICY patient_select_visible_med_diagnoses
  ON public.medical_record_diagnoses FOR SELECT
  USING (
    is_patient_visible
    AND patient_id IN (
      SELECT p.id
      FROM public.patients p
      WHERE p.user_id = auth.uid()
        AND NOT p.is_anonymized
    )
  );

DROP POLICY IF EXISTS staff_insert_med_diagnoses ON public.medical_record_diagnoses;
CREATE POLICY staff_insert_med_diagnoses
  ON public.medical_record_diagnoses FOR INSERT
  WITH CHECK (
    public._user_can_manage_clinic(clinic_id, auth.uid())
    AND diagnosed_by = auth.uid()
  );

DROP POLICY IF EXISTS staff_update_med_diagnoses ON public.medical_record_diagnoses;
CREATE POLICY staff_update_med_diagnoses
  ON public.medical_record_diagnoses FOR UPDATE
  USING (public._user_can_manage_clinic(clinic_id, auth.uid()))
  WITH CHECK (public._user_can_manage_clinic(clinic_id, auth.uid()));

-- Prescriptions
DROP POLICY IF EXISTS staff_select_med_prescriptions ON public.medical_record_prescriptions;
CREATE POLICY staff_select_med_prescriptions
  ON public.medical_record_prescriptions FOR SELECT
  USING (public._user_can_manage_clinic(clinic_id, auth.uid()));

DROP POLICY IF EXISTS patient_select_visible_med_prescriptions ON public.medical_record_prescriptions;
CREATE POLICY patient_select_visible_med_prescriptions
  ON public.medical_record_prescriptions FOR SELECT
  USING (
    is_patient_visible
    AND patient_id IN (
      SELECT p.id
      FROM public.patients p
      WHERE p.user_id = auth.uid()
        AND NOT p.is_anonymized
    )
  );

DROP POLICY IF EXISTS staff_insert_med_prescriptions ON public.medical_record_prescriptions;
CREATE POLICY staff_insert_med_prescriptions
  ON public.medical_record_prescriptions FOR INSERT
  WITH CHECK (
    public._user_can_manage_clinic(clinic_id, auth.uid())
    AND prescribed_by = auth.uid()
  );

DROP POLICY IF EXISTS staff_update_med_prescriptions ON public.medical_record_prescriptions;
CREATE POLICY staff_update_med_prescriptions
  ON public.medical_record_prescriptions FOR UPDATE
  USING (public._user_can_manage_clinic(clinic_id, auth.uid()))
  WITH CHECK (public._user_can_manage_clinic(clinic_id, auth.uid()));

-- Lab results
DROP POLICY IF EXISTS staff_select_med_lab_results ON public.medical_record_lab_results;
CREATE POLICY staff_select_med_lab_results
  ON public.medical_record_lab_results FOR SELECT
  USING (public._user_can_manage_clinic(clinic_id, auth.uid()));

DROP POLICY IF EXISTS patient_select_visible_med_lab_results ON public.medical_record_lab_results;
CREATE POLICY patient_select_visible_med_lab_results
  ON public.medical_record_lab_results FOR SELECT
  USING (
    is_patient_visible
    AND patient_id IN (
      SELECT p.id
      FROM public.patients p
      WHERE p.user_id = auth.uid()
        AND NOT p.is_anonymized
    )
  );

DROP POLICY IF EXISTS staff_insert_med_lab_results ON public.medical_record_lab_results;
CREATE POLICY staff_insert_med_lab_results
  ON public.medical_record_lab_results FOR INSERT
  WITH CHECK (
    public._user_can_manage_clinic(clinic_id, auth.uid())
    AND recorded_by = auth.uid()
  );

DROP POLICY IF EXISTS staff_update_med_lab_results ON public.medical_record_lab_results;
CREATE POLICY staff_update_med_lab_results
  ON public.medical_record_lab_results FOR UPDATE
  USING (public._user_can_manage_clinic(clinic_id, auth.uid()))
  WITH CHECK (public._user_can_manage_clinic(clinic_id, auth.uid()));


-- ---------------------------------------------------------------------------
-- Harden walk-in revocation: authenticated clinic manager only.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.revoke_walkin_access_with_token(
  p_grant_id UUID,
  p_stop_token TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_grant public.medical_record_access_grants%ROWTYPE;
  v_token_supplied BOOLEAN;
BEGIN
  v_user_id := public._medical_assert_authenticated();
  v_token_supplied := COALESCE(NULLIF(btrim(p_stop_token), ''), '') <> '';

  IF p_grant_id IS NULL THEN
    RAISE EXCEPTION 'grant_id is required';
  END IF;

  SELECT g.* INTO v_grant
  FROM public.medical_record_access_grants g
  JOIN public.patients p ON p.id = g.patient_id
  WHERE g.id = p_grant_id
    AND p.user_id IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'walkin_grant_not_found');
  END IF;

  IF NOT public._user_can_manage_clinic(v_grant.clinic_id, v_user_id) THEN
    RETURN jsonb_build_object('error', 'not_authorized');
  END IF;

  IF v_grant.status NOT IN ('pending_otp', 'active') THEN
    RETURN jsonb_build_object('error', 'already_finalized', 'status', v_grant.status);
  END IF;

  UPDATE public.medical_record_access_grants
  SET status = 'revoked',
      revoked_at = NOW(),
      revoked_by = v_user_id,
      revocation_reason = 'walkin_stop',
      updated_at = NOW()
  WHERE id = p_grant_id;

  PERFORM public._medical_insert_audit_log(
    v_user_id,
    v_grant.clinic_id,
    'medical_record_grant',
    p_grant_id,
    'revoke_walkin',
    jsonb_build_object(
      'mode', 'staff_authenticated',
      'token_supplied', v_token_supplied
    )
  );

  RETURN jsonb_build_object('success', true, 'revoked_grant_id', p_grant_id);
END;
$$;
