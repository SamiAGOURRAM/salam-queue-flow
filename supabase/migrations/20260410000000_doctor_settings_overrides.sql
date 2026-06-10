-- Migration: Doctor-level settings overrides
-- Description:
-- - Keep clinic defaults as canonical baseline.
-- - Add optional doctor-level overrides for appointment types and daily queue modes.
-- - Resolve effective queue mode per doctor for booking and personal queue paths.

ALTER TABLE public.clinic_staff
  ADD COLUMN IF NOT EXISTS appointment_types_override JSONB,
  ADD COLUMN IF NOT EXISTS daily_queue_modes_override JSONB;

COMMENT ON COLUMN public.clinic_staff.appointment_types_override IS
  'Optional doctor-level appointment types override (fallback to clinics.settings.appointment_types).';

COMMENT ON COLUMN public.clinic_staff.daily_queue_modes_override IS
  'Optional doctor-level daily queue mode override map by day key (monday..sunday) with values fluid/slotted.';

CREATE OR REPLACE FUNCTION public.get_effective_queue_mode_for_staff(
  p_clinic_id UUID,
  p_staff_id UUID,
  p_date DATE
)
RETURNS TEXT
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_staff_daily_modes JSONB := NULL;
  v_day_name TEXT;
  v_staff_day_mode TEXT;
BEGIN
  IF p_clinic_id IS NULL OR p_date IS NULL THEN
    RAISE EXCEPTION 'clinic_id and date are required';
  END IF;

  IF p_staff_id IS NULL THEN
    RETURN public.get_effective_queue_mode(p_clinic_id, p_date);
  END IF;

  SELECT cs.daily_queue_modes_override
  INTO v_staff_daily_modes
  FROM public.clinic_staff cs
  WHERE cs.id = p_staff_id
    AND cs.clinic_id = p_clinic_id
    AND COALESCE(cs.is_active, true) = true
  LIMIT 1;

  v_day_name := LOWER(TRIM(TO_CHAR(p_date, 'Day')));

  IF v_staff_daily_modes IS NOT NULL
    AND jsonb_typeof(v_staff_daily_modes) = 'object'
    AND v_staff_daily_modes ? v_day_name THEN
    v_staff_day_mode := v_staff_daily_modes ->> v_day_name;

    IF v_staff_day_mode IN ('fluid', 'slotted') THEN
      RETURN v_staff_day_mode;
    END IF;
  END IF;

  RETURN public.get_effective_queue_mode(p_clinic_id, p_date);
END;
$$;

CREATE OR REPLACE FUNCTION public.get_queue_mode_for_staff(
  p_clinic_id UUID,
  p_staff_id UUID,
  p_date DATE
)
RETURNS TEXT
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN public.get_effective_queue_mode_for_staff(p_clinic_id, p_staff_id, p_date);
END;
$$;

CREATE OR REPLACE FUNCTION public.get_available_slots_for_mode(
  p_clinic_id UUID,
  p_staff_id UUID,
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
  v_payload JSONB;
BEGIN
  v_mode := public.get_effective_queue_mode_for_staff(p_clinic_id, p_staff_id, p_appointment_date);

  IF v_mode = 'fluid' THEN
    RETURN jsonb_build_object(
      'available', true,
      'reason', NULL,
      'slots', '[]'::jsonb,
      'duration', NULL,
      'bufferTime', NULL,
      'mode', v_mode
    );
  END IF;

  v_payload := public.get_available_slots(p_clinic_id, p_staff_id, p_appointment_date, p_appointment_type);

  IF v_payload IS NULL OR jsonb_typeof(v_payload) <> 'object' THEN
    RETURN jsonb_build_object(
      'available', false,
      'reason', 'invalid_slots_payload',
      'slots', '[]'::jsonb,
      'duration', NULL,
      'bufferTime', NULL,
      'mode', v_mode
    );
  END IF;

  RETURN jsonb_set(v_payload, '{mode}', to_jsonb(v_mode), true);
END;
$$;

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

CREATE OR REPLACE FUNCTION public.get_daily_schedule_for_staff(
  p_staff_id UUID,
  p_target_date TEXT
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_schedule JSON;
  v_clinic_id UUID;
  v_effective_mode TEXT;
  v_target_date DATE;
  v_scope JSONB;
  v_scope_mode TEXT;
  v_allowed_staff_ids UUID[] := ARRAY[]::UUID[];
BEGIN
  SELECT cs.clinic_id
  INTO v_clinic_id
  FROM public.clinic_staff cs
  WHERE cs.id = p_staff_id
    AND COALESCE(cs.is_active, true) = true
  LIMIT 1;

  IF v_clinic_id IS NULL THEN
    RAISE EXCEPTION 'Staff member not found: %', p_staff_id;
  END IF;

  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  v_scope := public._resolve_queue_scope_for_user(v_clinic_id, auth.uid());
  v_scope_mode := COALESCE(v_scope ->> 'scope_mode', 'clinic');

  IF v_scope_mode <> 'clinic' THEN
    SELECT COALESCE(array_agg(scope_staff_id::UUID), ARRAY[]::UUID[])
    INTO v_allowed_staff_ids
    FROM jsonb_array_elements_text(COALESCE(v_scope -> 'allowed_staff_ids', '[]'::jsonb)) AS scope_staff_id;

    IF NOT (p_staff_id = ANY(v_allowed_staff_ids)) THEN
      RAISE EXCEPTION 'You are not allowed to access this provider queue' USING ERRCODE = '42501';
    END IF;
  END IF;

  v_target_date := p_target_date::DATE;
  v_effective_mode := public.get_effective_queue_mode_for_staff(v_clinic_id, p_staff_id, v_target_date);

  SELECT json_build_object(
    'queue_mode', v_effective_mode,
    'schedule', COALESCE(
      (
        SELECT json_agg(
          json_build_object(
            'id', a.id,
            'clinic_id', a.clinic_id,
            'patient_id', a.patient_id,
            'staff_id', a.staff_id,
            'scheduled_time', a.scheduled_time,
            'time_slot', a.time_slot,
            'appointment_date', a.appointment_date,
            'queue_position', a.queue_position,
            'status', a.status,
            'appointment_type', a.appointment_type,
            'reason_for_visit', a.reason_for_visit,
            'is_present', a.is_present,
            'marked_absent_at', a.marked_absent_at,
            'returned_at', a.returned_at,
            'checked_in_at', a.checked_in_at,
            'actual_end_time', a.actual_end_time,
            'estimated_duration', a.estimated_duration,
            'predicted_wait_time', a.predicted_wait_time,
            'prediction_confidence', a.prediction_confidence,
            'predicted_start_time', a.predicted_start_time,
            'last_prediction_update', a.last_prediction_update,
            'priority_score', a.priority_score,
            'is_gap_filler', a.is_gap_filler,
            'created_at', a.created_at,
            'updated_at', a.updated_at,
            'original_queue_position', a.original_queue_position,
            'skip_count', a.skip_count,
            'skip_reason', a.skip_reason,
            'override_by', a.override_by,
            'is_walk_in', a.is_walk_in,
            'resource_id', a.resource_id,
            'resource', (
              SELECT json_build_object(
                'id', cr.id,
                'name', cr.name,
                'resource_type', cr.resource_type
              )
              FROM public.clinic_resources cr
              WHERE cr.id = a.resource_id
            ),
            'patient', (
              SELECT json_build_object(
                'id', p.id,
                'display_name', p.display_name
              )
              FROM public.patients p
              WHERE p.id = a.patient_id
            ),
            'clinic', (
              SELECT json_build_object(
                'id', c.id,
                'name', c.name,
                'specialty', c.specialty,
                'city', c.city,
                'address', c.address,
                'phone', c.phone
              )
              FROM public.clinics c
              WHERE c.id = a.clinic_id
            )
          )
          ORDER BY
            a.queue_position NULLS LAST,
            COALESCE(a.scheduled_time, '00:00') ASC,
            a.created_at ASC
        )
        FROM public.appointments a
        WHERE a.clinic_id = v_clinic_id
          AND a.staff_id = p_staff_id
          AND a.appointment_date = v_target_date
          AND a.status IN ('scheduled', 'waiting', 'in_progress', 'completed')
      ),
      '[]'::JSON
    )
  ) INTO v_schedule;

  RETURN v_schedule;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_effective_queue_mode_for_staff(UUID, UUID, DATE) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_queue_mode_for_staff(UUID, UUID, DATE) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_available_slots_for_mode(UUID, UUID, DATE, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_appointment_for_mode(UUID, UUID, UUID, DATE, TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_daily_schedule_for_staff(UUID, TEXT) TO authenticated;
