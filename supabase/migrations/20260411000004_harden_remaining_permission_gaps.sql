-- =====================================================
-- Harden remaining permission gaps after audit follow-up.
-- =====================================================
-- 1) Fix patient allergy access helper join and enforce medical permissions.
-- 2) Replace broad `_user_can_manage_clinic` checks in queue mutation RPCs.
-- 3) Enforce `manage_medical_records` for consultation note edits.
-- 4) Include custom doctor roles (base_role = doctor) in doctor activity report.
-- =====================================================

-- =====================================================
-- 1) Allergy helpers and policies.
-- =====================================================
CREATE OR REPLACE FUNCTION public._clinic_staff_can_access_patient_allergies(
  p_patient_id UUID,
  p_user_id UUID DEFAULT auth.uid()
)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_allowed BOOLEAN := false;
BEGIN
  IF p_user_id IS NULL OR p_patient_id IS NULL THEN
    RETURN false;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.appointments a
    JOIN public.patients pat ON pat.id = a.patient_id
    WHERE pat.id = p_patient_id
      AND public._user_has_clinic_permission(a.clinic_id, p_user_id, 'view_medical_records')
  )
  INTO v_allowed;

  RETURN v_allowed;
END;
$$;

CREATE OR REPLACE FUNCTION public._clinic_staff_can_manage_patient_allergies(
  p_patient_id UUID,
  p_user_id UUID DEFAULT auth.uid()
)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_allowed BOOLEAN := false;
BEGIN
  IF p_user_id IS NULL OR p_patient_id IS NULL THEN
    RETURN false;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.appointments a
    JOIN public.patients pat ON pat.id = a.patient_id
    WHERE pat.id = p_patient_id
      AND public._user_has_clinic_permission(a.clinic_id, p_user_id, 'manage_medical_records')
  )
  INTO v_allowed;

  RETURN v_allowed;
END;
$$;

REVOKE EXECUTE ON FUNCTION public._clinic_staff_can_access_patient_allergies(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public._clinic_staff_can_access_patient_allergies(UUID, UUID) TO authenticated;

REVOKE EXECUTE ON FUNCTION public._clinic_staff_can_manage_patient_allergies(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public._clinic_staff_can_manage_patient_allergies(UUID, UUID) TO authenticated;

DROP POLICY IF EXISTS clinic_staff_select_patient_allergies ON public.patient_allergies;
CREATE POLICY clinic_staff_select_patient_allergies
  ON public.patient_allergies FOR SELECT
  USING (public._clinic_staff_can_access_patient_allergies(patient_id, auth.uid()));

DROP POLICY IF EXISTS clinic_staff_insert_patient_allergies ON public.patient_allergies;
CREATE POLICY clinic_staff_insert_patient_allergies
  ON public.patient_allergies FOR INSERT
  WITH CHECK (
    public._clinic_staff_can_manage_patient_allergies(patient_id, auth.uid())
    AND recorded_by = auth.uid()
    AND source = 'clinician'
  );

DROP POLICY IF EXISTS clinic_staff_update_patient_allergies ON public.patient_allergies;
CREATE POLICY clinic_staff_update_patient_allergies
  ON public.patient_allergies FOR UPDATE
  USING (public._clinic_staff_can_manage_patient_allergies(patient_id, auth.uid()))
  WITH CHECK (public._clinic_staff_can_manage_patient_allergies(patient_id, auth.uid()));

-- =====================================================
-- 2) Queue mutation RPC authorization hardening.
-- =====================================================
CREATE OR REPLACE FUNCTION public.create_appointment_for_mode(
  p_clinic_id UUID,
  p_patient_id UUID,
  p_staff_id UUID,
  p_appointment_date DATE DEFAULT CURRENT_DATE,
  p_scheduled_time TEXT DEFAULT NULL,
  p_appointment_type TEXT DEFAULT 'consultation',
  p_reason_for_visit TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_patient_record_id UUID;
  v_patient_user_id UUID;
  v_mode TEXT;
  v_appointment_id UUID;
  v_queue_position INTEGER;
  v_availability JSONB;
  v_type public.appointment_type;
  v_duration INTEGER;
  v_can_manage_appointments BOOLEAN := false;
BEGIN
  v_user_id := auth.uid();

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF p_clinic_id IS NULL OR p_patient_id IS NULL OR p_staff_id IS NULL OR p_appointment_date IS NULL THEN
    RAISE EXCEPTION 'clinic_id, patient_id, staff_id, and appointment_date are required';
  END IF;

  IF p_appointment_date < CURRENT_DATE THEN
    RAISE EXCEPTION 'Cannot create appointment in the past';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.clinic_staff cs
    WHERE cs.id = p_staff_id
      AND cs.clinic_id = p_clinic_id
      AND COALESCE(cs.is_active, true) = true
  ) THEN
    RAISE EXCEPTION 'Provided staff_id does not belong to clinic or is inactive';
  END IF;

  v_patient_record_id := public._resolve_patient_record_id(p_patient_id);

  SELECT p.user_id
  INTO v_patient_user_id
  FROM public.patients p
  WHERE p.id = v_patient_record_id
    AND NOT p.is_anonymized;

  v_can_manage_appointments := public._user_has_clinic_permission(p_clinic_id, v_user_id, 'manage_appointments');

  IF NOT (
    v_patient_user_id = v_user_id
    OR v_can_manage_appointments
  ) THEN
    RAISE EXCEPTION 'Not authorized to create appointment for this patient';
  END IF;

  BEGIN
    v_type := COALESCE(NULLIF(p_appointment_type, '')::public.appointment_type, 'consultation'::public.appointment_type);
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'Invalid appointment_type: %', p_appointment_type;
  END;

  IF p_reason_for_visit IS NOT NULL AND length(p_reason_for_visit) > 1000 THEN
    RAISE EXCEPTION 'reason_for_visit exceeds 1000 characters';
  END IF;

  v_mode := public.get_effective_queue_mode_for_staff(p_clinic_id, p_staff_id, p_appointment_date);

  IF v_mode = 'slotted' THEN
    IF p_scheduled_time IS NULL THEN
      RAISE EXCEPTION 'scheduled_time is required in slotted mode';
    END IF;

    IF p_scheduled_time !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' THEN
      RAISE EXCEPTION 'scheduled_time must be in HH:MM format';
    END IF;

    v_availability := public.check_appointment_availability(
      p_clinic_id,
      p_staff_id,
      p_appointment_date,
      p_scheduled_time
    );

    IF COALESCE((v_availability->>'available')::BOOLEAN, false) = false THEN
      RAISE EXCEPTION 'This time slot is no longer available';
    END IF;
  ELSIF p_scheduled_time IS NOT NULL THEN
    IF p_scheduled_time !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' THEN
      RAISE EXCEPTION 'scheduled_time must be in HH:MM format';
    END IF;
  END IF;

  v_duration := public._default_appointment_duration(v_type);

  INSERT INTO public.appointments (
    clinic_id,
    patient_id,
    staff_id,
    appointment_date,
    scheduled_time,
    appointment_type,
    status,
    reason_for_visit,
    is_walk_in,
    booking_method,
    booked_by,
    estimated_duration,
    day_of_week
  ) VALUES (
    p_clinic_id,
    v_patient_record_id,
    p_staff_id,
    p_appointment_date,
    p_scheduled_time,
    v_type,
    'scheduled'::public.appointment_status,
    p_reason_for_visit,
    (v_mode = 'fluid' AND p_scheduled_time IS NULL),
    CASE WHEN v_can_manage_appointments THEN 'staff' ELSE 'online' END,
    v_user_id,
    v_duration,
    EXTRACT(ISODOW FROM p_appointment_date)::INTEGER
  )
  RETURNING id INTO v_appointment_id;

  PERFORM public.recalculate_queue_positions(p_clinic_id, p_appointment_date);

  SELECT a.queue_position
  INTO v_queue_position
  FROM public.appointments a
  WHERE a.id = v_appointment_id;

  RETURN jsonb_build_object(
    'appointment_id', v_appointment_id,
    'queue_position', v_queue_position
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.cancel_appointment(
  p_appointment_id UUID,
  p_cancelled_by UUID,
  p_reason TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_clinic_id UUID;
  v_patient_id UUID;
  v_patient_user_id UUID;
  v_status public.appointment_status;
  v_appointment_date DATE;
  v_can_manage BOOLEAN := false;
BEGIN
  v_user_id := auth.uid();

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF p_cancelled_by IS DISTINCT FROM v_user_id THEN
    RAISE EXCEPTION 'cancelled_by must match authenticated user';
  END IF;

  SELECT a.clinic_id, a.patient_id, a.status, a.appointment_date
  INTO v_clinic_id, v_patient_id, v_status, v_appointment_date
  FROM public.appointments a
  WHERE a.id = p_appointment_id;

  IF v_clinic_id IS NULL THEN
    RAISE EXCEPTION 'Appointment not found';
  END IF;

  IF v_status = 'completed'::public.appointment_status THEN
    RAISE EXCEPTION 'Cannot cancel a completed appointment';
  END IF;

  IF v_status = 'cancelled'::public.appointment_status THEN
    RAISE EXCEPTION 'Appointment is already cancelled';
  END IF;

  SELECT p.user_id
  INTO v_patient_user_id
  FROM public.patients p
  WHERE p.id = v_patient_id;

  v_can_manage :=
    public._user_has_clinic_permission(v_clinic_id, v_user_id, 'manage_appointments')
    OR public._user_has_clinic_permission(v_clinic_id, v_user_id, 'manage_queue');

  IF NOT (
    v_patient_user_id = v_user_id
    OR v_can_manage
  ) THEN
    RAISE EXCEPTION 'Not authorized to cancel this appointment';
  END IF;

  UPDATE public.appointments a
  SET
    status = 'cancelled'::public.appointment_status,
    cancellation_reason = COALESCE(p_reason, a.cancellation_reason),
    override_by = v_user_id,
    updated_at = NOW()
  WHERE a.id = p_appointment_id;

  PERFORM public.recalculate_queue_positions(v_clinic_id, v_appointment_date);

  RETURN public._appointment_to_queue_json(p_appointment_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.manually_assign_time_slot(
  p_appointment_id UUID,
  p_scheduled_time TEXT,
  p_assigned_by UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_clinic_id UUID;
  v_appointment_date DATE;
  v_status public.appointment_status;
  v_capacity INTEGER := 1;
  v_conflicts INTEGER := 0;
  v_queue_position INTEGER;
BEGIN
  v_user_id := auth.uid();

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF p_assigned_by IS DISTINCT FROM v_user_id THEN
    RAISE EXCEPTION 'assigned_by must match authenticated user';
  END IF;

  IF p_scheduled_time IS NULL OR p_scheduled_time !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' THEN
    RAISE EXCEPTION 'scheduled_time must be in HH:MM format';
  END IF;

  SELECT a.clinic_id, a.appointment_date, a.status
  INTO v_clinic_id, v_appointment_date, v_status
  FROM public.appointments a
  WHERE a.id = p_appointment_id;

  IF v_clinic_id IS NULL THEN
    RAISE EXCEPTION 'Appointment not found';
  END IF;

  IF NOT (
    public._user_has_clinic_permission(v_clinic_id, v_user_id, 'manage_appointments')
    OR public._user_has_clinic_permission(v_clinic_id, v_user_id, 'manage_queue')
  ) THEN
    RAISE EXCEPTION 'Not authorized to assign time slots for this clinic';
  END IF;

  IF v_status IN ('completed'::public.appointment_status, 'cancelled'::public.appointment_status) THEN
    RAISE EXCEPTION 'Cannot reassign time for completed/cancelled appointment';
  END IF;

  SELECT COALESCE(NULLIF(c.settings->>'slot_capacity', '')::INTEGER, 1)
  INTO v_capacity
  FROM public.clinics c
  WHERE c.id = v_clinic_id;

  IF v_capacity IS NULL OR v_capacity < 1 THEN
    v_capacity := 1;
  END IF;

  SELECT COUNT(*)
  INTO v_conflicts
  FROM public.appointments a
  WHERE a.clinic_id = v_clinic_id
    AND a.appointment_date = v_appointment_date
    AND a.scheduled_time = p_scheduled_time
    AND a.id <> p_appointment_id
    AND a.status IN ('scheduled', 'waiting', 'in_progress');

  IF v_conflicts >= v_capacity THEN
    RAISE EXCEPTION 'This time slot is no longer available';
  END IF;

  UPDATE public.appointments a
  SET
    scheduled_time = p_scheduled_time,
    updated_at = NOW()
  WHERE a.id = p_appointment_id;

  PERFORM public.recalculate_queue_positions(v_clinic_id, v_appointment_date);

  SELECT a.queue_position
  INTO v_queue_position
  FROM public.appointments a
  WHERE a.id = p_appointment_id;

  RETURN jsonb_build_object(
    'success', true,
    'appointment_id', p_appointment_id,
    'scheduled_time', p_scheduled_time,
    'queue_position', v_queue_position
  );
END;
$$;

-- =====================================================
-- 3) Enforce medical permission for consultation notes.
-- =====================================================
CREATE OR REPLACE FUNCTION public._enforce_medical_permission_for_appointment_notes()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF (
    NEW.reason_for_visit IS DISTINCT FROM OLD.reason_for_visit
    OR NEW.notes IS DISTINCT FROM OLD.notes
  ) THEN
    IF auth.uid() IS NULL THEN
      RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
    END IF;

    IF NOT public._user_has_clinic_permission(NEW.clinic_id, auth.uid(), 'manage_medical_records') THEN
      RAISE EXCEPTION 'You do not have permission to edit consultation notes' USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public._enforce_medical_permission_for_appointment_notes() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public._enforce_medical_permission_for_appointment_notes() TO authenticated;

DROP TRIGGER IF EXISTS enforce_medical_permission_for_appointment_notes ON public.appointments;
CREATE TRIGGER enforce_medical_permission_for_appointment_notes
BEFORE UPDATE OF reason_for_visit, notes ON public.appointments
FOR EACH ROW
EXECUTE FUNCTION public._enforce_medical_permission_for_appointment_notes();

-- =====================================================
-- 4) Doctor activity report: include custom doctor roles.
-- =====================================================
CREATE OR REPLACE FUNCTION public.get_doctor_activity_report(
  p_clinic_id UUID,
  p_from_date DATE,
  p_to_date DATE
)
RETURNS TABLE (
  staff_id UUID,
  doctor_name TEXT,
  specialization TEXT,
  completed_count INTEGER,
  in_progress_count INTEGER,
  cancelled_count INTEGER,
  no_show_count INTEGER,
  avg_duration_minutes NUMERIC,
  total_patients INTEGER
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_clinic_id IS NULL OR p_from_date IS NULL OR p_to_date IS NULL THEN
    RAISE EXCEPTION 'clinic_id, from_date, and to_date are required';
  END IF;

  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  IF NOT public._user_has_clinic_permission(p_clinic_id, auth.uid(), 'view_analytics') THEN
    RAISE EXCEPTION 'You do not have permission to view clinic analytics' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH doctors AS (
    SELECT
      cs.id AS staff_id,
      COALESCE(p.full_name, 'Doctor') AS doctor_name,
      cs.specialization
    FROM public.clinic_staff cs
    JOIN public.clinics c ON c.id = cs.clinic_id
    LEFT JOIN public.profiles p ON p.id = cs.user_id
    WHERE cs.clinic_id = p_clinic_id
      AND COALESCE(cs.is_active, true) = true
      AND (
        LOWER(COALESCE(cs.role, '')) = 'doctor'
        OR EXISTS (
          SELECT 1
          FROM jsonb_array_elements(COALESCE(c.settings -> 'role_definitions', '[]'::jsonb)) AS role_def
          WHERE LOWER(COALESCE(role_def ->> 'key', role_def ->> 'role_key', '')) = LOWER(COALESCE(cs.role, ''))
            AND LOWER(COALESCE(role_def ->> 'base_role', role_def ->> 'baseRole', '')) = 'doctor'
        )
      )
  ),
  appt_stats AS (
    SELECT
      a.staff_id,
      COUNT(*) FILTER (WHERE a.status = 'completed')::INTEGER AS completed_count,
      COUNT(*) FILTER (WHERE a.status = 'in_progress')::INTEGER AS in_progress_count,
      COUNT(*) FILTER (WHERE a.status = 'cancelled')::INTEGER AS cancelled_count,
      COUNT(*) FILTER (WHERE a.status = 'no_show')::INTEGER AS no_show_count,
      COUNT(*)::INTEGER AS total_patients,
      AVG(
        CASE
          WHEN a.status = 'completed' AND a.actual_duration IS NOT NULL
            THEN a.actual_duration::NUMERIC
          WHEN a.status = 'completed'
             AND a.actual_end_time IS NOT NULL
             AND a.checked_in_at IS NOT NULL
            THEN EXTRACT(EPOCH FROM (a.actual_end_time - a.checked_in_at)) / 60.0
          ELSE NULL
        END
      ) AS avg_duration_minutes
    FROM public.appointments a
    WHERE a.clinic_id = p_clinic_id
      AND a.appointment_date BETWEEN p_from_date AND p_to_date
    GROUP BY a.staff_id
  )
  SELECT
    d.staff_id,
    d.doctor_name,
    d.specialization,
    COALESCE(s.completed_count, 0),
    COALESCE(s.in_progress_count, 0),
    COALESCE(s.cancelled_count, 0),
    COALESCE(s.no_show_count, 0),
    ROUND(s.avg_duration_minutes, 1),
    COALESCE(s.total_patients, 0)
  FROM doctors d
  LEFT JOIN appt_stats s ON s.staff_id = d.staff_id
  ORDER BY COALESCE(s.completed_count, 0) DESC, d.doctor_name ASC;
END;
$$;
