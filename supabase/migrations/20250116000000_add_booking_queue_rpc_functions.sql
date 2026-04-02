-- Migration: Add missing booking/queue RPC functions
-- Purpose: Restore frontend RPC compatibility with GDPR-conscious access controls
--
-- Design notes:
-- - SECURITY DEFINER is used to bypass legacy RLS gaps, but each write path enforces explicit auth checks.
-- - Returned payloads are minimized and avoid decrypted PII (display_name only when needed).
-- - Functions accept both patients.id and auth.users.id for backward compatibility.

-- =====================================================
-- 1. INTERNAL HELPERS (NOT EXPOSED)
-- =====================================================

CREATE OR REPLACE FUNCTION public._user_can_manage_clinic(
  p_clinic_id UUID,
  p_user_id UUID DEFAULT auth.uid()
)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM public.user_roles ur
    WHERE ur.user_id = p_user_id
      AND ur.clinic_id = p_clinic_id
      AND ur.role IN ('super_admin', 'clinic_owner', 'staff')
  );
END;
$$;

CREATE OR REPLACE FUNCTION public._default_appointment_duration(
  p_appointment_type public.appointment_type
)
RETURNS INTEGER
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
BEGIN
  RETURN CASE p_appointment_type
    WHEN 'follow_up' THEN 10
    WHEN 'procedure' THEN 30
    WHEN 'emergency' THEN 20
    WHEN 'vaccination' THEN 10
    WHEN 'screening' THEN 15
    ELSE 15
  END;
END;
$$;

CREATE OR REPLACE FUNCTION public._resolve_patient_record_id(
  p_patient_or_user_id UUID
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_patient_id UUID;
  v_profile public.profiles%ROWTYPE;
BEGIN
  IF p_patient_or_user_id IS NULL THEN
    RAISE EXCEPTION 'Patient identifier is required';
  END IF;

  -- Preferred path: caller already passes patients.id
  SELECT p.id
  INTO v_patient_id
  FROM public.patients p
  WHERE p.id = p_patient_or_user_id
  LIMIT 1;

  IF v_patient_id IS NOT NULL THEN
    RETURN v_patient_id;
  END IF;

  -- Backward-compat path: caller passes auth.users.id
  SELECT p.id
  INTO v_patient_id
  FROM public.patients p
  WHERE p.user_id = p_patient_or_user_id
  LIMIT 1;

  IF v_patient_id IS NOT NULL THEN
    RETURN v_patient_id;
  END IF;

  -- Last resort for legacy users: create patient from existing profile if enough identity data exists
  SELECT pr.*
  INTO v_profile
  FROM public.profiles pr
  WHERE pr.id = p_patient_or_user_id
  LIMIT 1;

  IF v_profile.id IS NULL THEN
    RAISE EXCEPTION 'Patient record not found for id %', p_patient_or_user_id;
  END IF;

  IF COALESCE(v_profile.phone_number, '') = '' THEN
    RAISE EXCEPTION 'Cannot auto-create patient record: missing phone number for user %', p_patient_or_user_id;
  END IF;

  v_patient_id := public.create_patient(
    p_full_name := COALESCE(NULLIF(v_profile.full_name, ''), 'Patient'),
    p_phone_number := v_profile.phone_number,
    p_email := v_profile.email,
    p_source := 'app',
    p_user_id := v_profile.id,
    p_created_by := v_profile.id,
    p_consent_sms := false,
    p_consent_data_processing := true,
    p_consent_given_by := 'patient_app'
  );

  RETURN v_patient_id;
END;
$$;

CREATE OR REPLACE FUNCTION public._appointment_to_queue_json(
  p_appointment_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result JSONB;
BEGIN
  SELECT jsonb_build_object(
    'id', a.id,
    'clinic_id', a.clinic_id,
    'patient_id', a.patient_id,
    'staff_id', a.staff_id,
    'start_time', CASE
      WHEN a.scheduled_time IS NOT NULL THEN (a.appointment_date::text || ' ' || a.scheduled_time)::timestamptz
      ELSE NULL
    END,
    'end_time', CASE
      WHEN a.scheduled_time IS NOT NULL THEN (a.appointment_date::text || ' ' || a.scheduled_time)::timestamptz + make_interval(mins => COALESCE(a.estimated_duration, 15))
      ELSE NULL
    END,
    'appointment_date', a.appointment_date,
    'queue_position', a.queue_position,
    'status', a.status,
    'appointment_type', a.appointment_type,
    'is_present', a.is_present,
    'marked_absent_at', a.marked_absent_at,
    'returned_at', a.returned_at,
    'checked_in_at', a.checked_in_at,
    'actual_end_time', a.actual_end_time,
    'estimated_duration', a.estimated_duration,
    'predicted_wait_time', a.predicted_wait_time,
    'prediction_mode', NULL,
    'prediction_confidence', a.prediction_confidence,
    'predicted_start_time', a.predicted_start_time,
    'last_prediction_update', a.last_prediction_update,
    'created_at', a.created_at,
    'updated_at', a.updated_at,
    'original_queue_position', a.original_queue_position,
    'skip_count', a.skip_count,
    'skip_reason', a.skip_reason,
    'override_by', a.override_by,
    'is_walk_in', a.is_walk_in,
    'priority_score', a.priority_score,
    'is_gap_filler', a.is_gap_filler,
    'promoted_from_waitlist', a.promoted_from_waitlist,
    'late_arrival_converted', a.late_arrival_converted,
    'original_slot_time', a.original_slot_time,
    'patient', CASE
      WHEN p.id IS NULL THEN NULL
      ELSE jsonb_build_object('id', p.id, 'display_name', p.display_name)
    END,
    'clinic', jsonb_build_object(
      'id', c.id,
      'name', c.name,
      'specialty', c.specialty,
      'city', c.city,
      'address', c.address,
      'phone', c.phone
    )
  )
  INTO v_result
  FROM public.appointments a
  JOIN public.clinics c ON c.id = a.clinic_id
  LEFT JOIN public.patients p ON p.id = a.patient_id
  WHERE a.id = p_appointment_id;

  RETURN v_result;
END;
$$;

-- =====================================================
-- 2. READ RPCS
-- =====================================================

CREATE OR REPLACE FUNCTION public.check_appointment_availability(
  p_clinic_id UUID,
  p_appointment_date DATE,
  p_scheduled_time TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing_count INTEGER := 0;
  v_capacity INTEGER := 1;
BEGIN
  IF p_clinic_id IS NULL OR p_appointment_date IS NULL OR p_scheduled_time IS NULL THEN
    RAISE EXCEPTION 'clinic_id, appointment_date, and scheduled_time are required';
  END IF;

  IF p_scheduled_time !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' THEN
    RAISE EXCEPTION 'scheduled_time must be in HH:MM format';
  END IF;

  SELECT COALESCE(NULLIF(c.settings->>'slot_capacity', '')::INTEGER, 1)
  INTO v_capacity
  FROM public.clinics c
  WHERE c.id = p_clinic_id;

  IF v_capacity IS NULL OR v_capacity < 1 THEN
    v_capacity := 1;
  END IF;

  SELECT COUNT(*)
  INTO v_existing_count
  FROM public.appointments a
  WHERE a.clinic_id = p_clinic_id
    AND a.appointment_date = p_appointment_date
    AND a.scheduled_time = p_scheduled_time
    AND a.status IN ('scheduled', 'waiting', 'in_progress');

  RETURN jsonb_build_object(
    'available', v_existing_count < v_capacity,
    'existingCount', v_existing_count,
    'capacity', v_capacity
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_available_slots(
  p_clinic_id UUID,
  p_appointment_date DATE,
  p_appointment_type TEXT DEFAULT 'consultation'
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_day_start TEXT := '09:00';
  v_day_end TEXT := '17:00';
  v_duration INTEGER := 15;
  v_slot_interval INTEGER := 15;
  v_capacity INTEGER := 1;
  v_buffer INTEGER := 0;
  v_slots JSONB := '[]'::jsonb;
  v_available BOOLEAN := false;
  v_type public.appointment_type;
BEGIN
  IF p_clinic_id IS NULL OR p_appointment_date IS NULL THEN
    RAISE EXCEPTION 'clinic_id and appointment_date are required';
  END IF;

  BEGIN
    v_type := COALESCE(NULLIF(p_appointment_type, '')::public.appointment_type, 'consultation'::public.appointment_type);
  EXCEPTION WHEN OTHERS THEN
    v_type := 'consultation'::public.appointment_type;
  END;

  SELECT
    COALESCE(NULLIF(c.settings->>'day_start', ''), '09:00'),
    COALESCE(NULLIF(c.settings->>'day_end', ''), '17:00'),
    COALESCE(NULLIF(c.settings->>'slot_interval_minutes', '')::INTEGER, 15),
    COALESCE(NULLIF(c.settings->>'slot_capacity', '')::INTEGER, 1),
    COALESCE(NULLIF(c.settings->>'eta_buffer_minutes', '')::INTEGER, 0)
  INTO
    v_day_start,
    v_day_end,
    v_slot_interval,
    v_capacity,
    v_buffer
  FROM public.clinics c
  WHERE c.id = p_clinic_id;

  v_duration := public._default_appointment_duration(v_type);

  IF v_slot_interval IS NULL OR v_slot_interval < 1 THEN
    v_slot_interval := 15;
  END IF;

  IF v_capacity IS NULL OR v_capacity < 1 THEN
    v_capacity := 1;
  END IF;

  IF v_day_start !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' THEN
    v_day_start := '09:00';
  END IF;

  IF v_day_end !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' THEN
    v_day_end := '17:00';
  END IF;

  WITH candidate_slots AS (
    SELECT to_char(gs, 'HH24:MI') AS slot_time
    FROM generate_series(
      p_appointment_date::timestamp + v_day_start::time,
      p_appointment_date::timestamp + v_day_end::time - make_interval(mins => v_duration),
      make_interval(mins => v_slot_interval)
    ) AS gs
    WHERE p_appointment_date <> CURRENT_DATE OR gs::time > CURRENT_TIME
  ),
  slot_usage AS (
    SELECT
      a.scheduled_time,
      COUNT(*) FILTER (WHERE a.status IN ('scheduled', 'waiting', 'in_progress')) AS used_count
    FROM public.appointments a
    WHERE a.clinic_id = p_clinic_id
      AND a.appointment_date = p_appointment_date
      AND a.scheduled_time IS NOT NULL
    GROUP BY a.scheduled_time
  )
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'time', cs.slot_time,
        'available', COALESCE(su.used_count, 0) < v_capacity
      )
      ORDER BY cs.slot_time
    ),
    '[]'::jsonb
  )
  INTO v_slots
  FROM candidate_slots cs
  LEFT JOIN slot_usage su ON su.scheduled_time = cs.slot_time;

  SELECT EXISTS (
    SELECT 1
    FROM jsonb_array_elements(v_slots) AS slot
    WHERE (slot->>'available')::BOOLEAN = true
  )
  INTO v_available;

  RETURN jsonb_build_object(
    'available', v_available,
    'reason', CASE WHEN v_available THEN NULL ELSE 'no_slots_available' END,
    'slots', v_slots,
    'duration', v_duration,
    'bufferTime', v_buffer
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_available_slots_for_mode(
  p_clinic_id UUID,
  p_appointment_date DATE,
  p_appointment_type TEXT DEFAULT 'consultation'
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_mode TEXT;
BEGIN
  v_mode := public.get_effective_queue_mode(p_clinic_id, p_appointment_date);

  IF v_mode = 'fluid' THEN
    RETURN jsonb_build_object(
      'available', true,
      'reason', NULL,
      'slots', '[]'::jsonb,
      'duration', NULL,
      'bufferTime', NULL
    );
  END IF;

  RETURN public.get_available_slots(p_clinic_id, p_appointment_date, p_appointment_type);
END;
$$;

-- =====================================================
-- 3. WRITE RPCS
-- =====================================================

CREATE OR REPLACE FUNCTION public.create_appointment_for_mode(
  p_clinic_id UUID,
  p_patient_id UUID,
  p_staff_id UUID DEFAULT NULL,
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
  v_staff_id UUID;
  v_mode TEXT;
  v_appointment_id UUID;
  v_queue_position INTEGER;
  v_availability JSONB;
  v_type public.appointment_type;
  v_duration INTEGER;
BEGIN
  v_user_id := auth.uid();

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF p_clinic_id IS NULL OR p_patient_id IS NULL OR p_appointment_date IS NULL THEN
    RAISE EXCEPTION 'clinic_id, patient_id, and appointment_date are required';
  END IF;

  IF p_appointment_date < CURRENT_DATE THEN
    RAISE EXCEPTION 'Cannot create appointment in the past';
  END IF;

  v_patient_record_id := public._resolve_patient_record_id(p_patient_id);

  SELECT p.user_id
  INTO v_patient_user_id
  FROM public.patients p
  WHERE p.id = v_patient_record_id
    AND NOT p.is_anonymized;

  IF NOT (
    v_patient_user_id = v_user_id
    OR public._user_can_manage_clinic(p_clinic_id, v_user_id)
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

  v_mode := public.get_effective_queue_mode(p_clinic_id, p_appointment_date);

  IF v_mode = 'slotted' THEN
    IF p_scheduled_time IS NULL THEN
      RAISE EXCEPTION 'scheduled_time is required in slotted mode';
    END IF;

    IF p_scheduled_time !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' THEN
      RAISE EXCEPTION 'scheduled_time must be in HH:MM format';
    END IF;

    v_availability := public.check_appointment_availability(
      p_clinic_id,
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

  IF p_staff_id IS NOT NULL THEN
    SELECT cs.id
    INTO v_staff_id
    FROM public.clinic_staff cs
    WHERE cs.id = p_staff_id
      AND cs.clinic_id = p_clinic_id
      AND COALESCE(cs.is_active, true) = true
    LIMIT 1;

    IF v_staff_id IS NULL THEN
      RAISE EXCEPTION 'Provided staff_id does not belong to clinic or is inactive';
    END IF;
  ELSE
    SELECT cs.id
    INTO v_staff_id
    FROM public.clinic_staff cs
    WHERE cs.clinic_id = p_clinic_id
      AND COALESCE(cs.is_active, true) = true
    ORDER BY cs.created_at ASC
    LIMIT 1;

    IF v_staff_id IS NULL THEN
      RAISE EXCEPTION 'No active staff found for clinic';
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
    v_staff_id,
    p_appointment_date,
    p_scheduled_time,
    v_type,
    'scheduled'::public.appointment_status,
    p_reason_for_visit,
    (v_mode = 'fluid' AND p_scheduled_time IS NULL),
    CASE WHEN public._user_can_manage_clinic(p_clinic_id, v_user_id) THEN 'staff' ELSE 'online' END,
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

CREATE OR REPLACE FUNCTION public.create_appointment_with_validation(
  p_clinic_id UUID,
  p_patient_id UUID,
  p_appointment_date DATE,
  p_scheduled_time TEXT,
  p_appointment_type TEXT,
  p_reason TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result JSONB;
  v_appointment_id UUID;
  v_staff_id UUID;
BEGIN
  v_result := public.create_appointment_for_mode(
    p_clinic_id := p_clinic_id,
    p_patient_id := p_patient_id,
    p_staff_id := NULL,
    p_appointment_date := p_appointment_date,
    p_scheduled_time := p_scheduled_time,
    p_appointment_type := p_appointment_type,
    p_reason_for_visit := p_reason
  );

  v_appointment_id := (v_result->>'appointment_id')::UUID;

  SELECT a.staff_id
  INTO v_staff_id
  FROM public.appointments a
  WHERE a.id = v_appointment_id;

  RETURN jsonb_build_object(
    'success', true,
    'appointmentId', v_appointment_id,
    'queuePosition', (v_result->>'queue_position')::INTEGER,
    'staffId', v_staff_id
  );
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object(
    'success', false,
    'error', SQLERRM
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.create_queue_entry(
  p_clinic_id UUID,
  p_staff_id UUID DEFAULT NULL,
  p_patient_id UUID DEFAULT NULL,
  p_guest_patient_id UUID DEFAULT NULL,
  p_is_guest BOOLEAN DEFAULT false,
  p_appointment_type TEXT DEFAULT 'consultation',
  p_is_walk_in BOOLEAN DEFAULT false,
  p_start_time TEXT DEFAULT NULL,
  p_end_time TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_start_ts TIMESTAMPTZ;
  v_end_ts TIMESTAMPTZ;
  v_patient_input UUID;
  v_creation JSONB;
  v_appointment_id UUID;
  v_duration INTEGER;
BEGIN
  IF p_start_time IS NULL THEN
    RAISE EXCEPTION 'start_time is required';
  END IF;

  BEGIN
    v_start_ts := p_start_time::timestamptz;
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'Invalid start_time format: expected ISO timestamp';
  END;

  IF p_end_time IS NOT NULL THEN
    BEGIN
      v_end_ts := p_end_time::timestamptz;
    EXCEPTION WHEN OTHERS THEN
      RAISE EXCEPTION 'Invalid end_time format: expected ISO timestamp';
    END;
  END IF;

  v_patient_input := COALESCE(p_patient_id, p_guest_patient_id);

  IF v_patient_input IS NULL THEN
    RAISE EXCEPTION 'patient_id is required';
  END IF;

  v_creation := public.create_appointment_for_mode(
    p_clinic_id := p_clinic_id,
    p_patient_id := v_patient_input,
    p_staff_id := p_staff_id,
    p_appointment_date := v_start_ts::date,
    p_scheduled_time := to_char(v_start_ts, 'HH24:MI'),
    p_appointment_type := p_appointment_type,
    p_reason_for_visit := NULL
  );

  v_appointment_id := (v_creation->>'appointment_id')::UUID;

  IF v_end_ts IS NOT NULL THEN
    v_duration := GREATEST(1, FLOOR(EXTRACT(EPOCH FROM (v_end_ts - v_start_ts)) / 60)::INTEGER);

    UPDATE public.appointments a
    SET
      estimated_duration = v_duration,
      is_walk_in = COALESCE(p_is_walk_in, false),
      updated_at = NOW()
    WHERE a.id = v_appointment_id;
  ELSE
    UPDATE public.appointments a
    SET
      is_walk_in = COALESCE(p_is_walk_in, false),
      updated_at = NOW()
    WHERE a.id = v_appointment_id;
  END IF;

  RETURN public._appointment_to_queue_json(v_appointment_id);
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

  IF NOT (
    v_patient_user_id = v_user_id
    OR public._user_can_manage_clinic(v_clinic_id, v_user_id)
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

  IF NOT public._user_can_manage_clinic(v_clinic_id, v_user_id) THEN
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
-- 4. GRANTS
-- =====================================================

-- Read-only booking checks: safe for unauthenticated browsing
GRANT EXECUTE ON FUNCTION public.check_appointment_availability(UUID, DATE, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_available_slots(UUID, DATE, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_available_slots_for_mode(UUID, DATE, TEXT) TO anon, authenticated;

-- Write actions require authenticated user
GRANT EXECUTE ON FUNCTION public.create_appointment_for_mode(UUID, UUID, UUID, DATE, TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_appointment_with_validation(UUID, UUID, DATE, TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_queue_entry(UUID, UUID, UUID, UUID, BOOLEAN, TEXT, BOOLEAN, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_appointment(UUID, UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.manually_assign_time_slot(UUID, TEXT, UUID) TO authenticated;

-- Internal helper surface should not be directly callable by clients
REVOKE EXECUTE ON FUNCTION public._user_can_manage_clinic(UUID, UUID) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public._default_appointment_duration(public.appointment_type) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public._resolve_patient_record_id(UUID) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public._appointment_to_queue_json(UUID) FROM PUBLIC, anon, authenticated;
