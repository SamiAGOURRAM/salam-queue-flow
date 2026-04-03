-- P0 Doctor-first booking execution path.
-- This migration removes clinic-wide slot checks and enforces provider-specific scheduling.

DROP FUNCTION IF EXISTS public.check_appointment_availability(UUID, DATE, TEXT);
DROP FUNCTION IF EXISTS public.get_available_slots(UUID, DATE, TEXT);
DROP FUNCTION IF EXISTS public.get_available_slots_for_mode(UUID, DATE, TEXT);
DROP FUNCTION IF EXISTS public.create_appointment_with_validation(UUID, UUID, DATE, TEXT, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.create_appointment_for_mode(UUID, UUID, UUID, DATE, TEXT, TEXT, TEXT);

CREATE OR REPLACE FUNCTION public.check_appointment_availability(
  p_clinic_id UUID,
  p_staff_id UUID,
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
  IF p_clinic_id IS NULL OR p_staff_id IS NULL OR p_appointment_date IS NULL OR p_scheduled_time IS NULL THEN
    RAISE EXCEPTION 'clinic_id, staff_id, appointment_date, and scheduled_time are required';
  END IF;

  IF p_scheduled_time !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' THEN
    RAISE EXCEPTION 'scheduled_time must be in HH:MM format';
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

  SELECT COALESCE(NULLIF(c.settings->>'slot_capacity_per_staff', '')::INTEGER, 1)
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
    AND a.staff_id = p_staff_id
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
  v_day_start TEXT := '09:00';
  v_day_end TEXT := '17:00';
  v_duration INTEGER := 15;
  v_slot_interval INTEGER := 15;
  v_capacity INTEGER := 1;
  v_buffer INTEGER := 0;
  v_slots JSONB := '[]'::jsonb;
  v_available BOOLEAN := false;
  v_type public.appointment_type;
  v_staff_hours JSONB := NULL;
  v_clinic_settings JSONB := '{}'::jsonb;
  v_day_key TEXT;
  v_staff_day JSONB := NULL;
  v_clinic_day JSONB := NULL;
  v_staff_closed BOOLEAN := false;
  v_clinic_closed BOOLEAN := false;
BEGIN
  IF p_clinic_id IS NULL OR p_staff_id IS NULL OR p_appointment_date IS NULL THEN
    RAISE EXCEPTION 'clinic_id, staff_id, and appointment_date are required';
  END IF;

  BEGIN
    v_type := COALESCE(NULLIF(p_appointment_type, '')::public.appointment_type, 'consultation'::public.appointment_type);
  EXCEPTION WHEN OTHERS THEN
    v_type := 'consultation'::public.appointment_type;
  END;

  SELECT cs.working_hours, c.settings
  INTO v_staff_hours, v_clinic_settings
  FROM public.clinic_staff cs
  JOIN public.clinics c ON c.id = cs.clinic_id
  WHERE cs.id = p_staff_id
    AND cs.clinic_id = p_clinic_id
    AND COALESCE(cs.is_active, true) = true
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Provided staff_id does not belong to clinic or is inactive';
  END IF;

  v_day_key := CASE EXTRACT(DOW FROM p_appointment_date)::INTEGER
    WHEN 0 THEN 'sunday'
    WHEN 1 THEN 'monday'
    WHEN 2 THEN 'tuesday'
    WHEN 3 THEN 'wednesday'
    WHEN 4 THEN 'thursday'
    WHEN 5 THEN 'friday'
    WHEN 6 THEN 'saturday'
  END;

  IF v_staff_hours IS NOT NULL
    AND jsonb_typeof(v_staff_hours) = 'object'
    AND v_staff_hours ? v_day_key THEN
    v_staff_day := v_staff_hours -> v_day_key;
  END IF;

  IF v_clinic_settings IS NOT NULL
    AND jsonb_typeof(v_clinic_settings) = 'object'
    AND v_clinic_settings ? 'working_hours'
    AND jsonb_typeof(v_clinic_settings -> 'working_hours') = 'object'
    AND (v_clinic_settings -> 'working_hours') ? v_day_key THEN
    v_clinic_day := v_clinic_settings -> 'working_hours' -> v_day_key;
  END IF;

  IF v_staff_day IS NOT NULL THEN
    v_staff_closed := COALESCE((v_staff_day ->> 'closed')::BOOLEAN, false);
    IF v_staff_closed THEN
      RETURN jsonb_build_object(
        'available', false,
        'reason', 'staff_closed',
        'slots', '[]'::jsonb,
        'duration', NULL,
        'bufferTime', NULL
      );
    END IF;
  END IF;

  IF v_staff_day IS NULL AND v_clinic_day IS NOT NULL THEN
    v_clinic_closed := COALESCE((v_clinic_day ->> 'closed')::BOOLEAN, false);
    IF v_clinic_closed THEN
      RETURN jsonb_build_object(
        'available', false,
        'reason', 'clinic_closed',
        'slots', '[]'::jsonb,
        'duration', NULL,
        'bufferTime', NULL
      );
    END IF;
  END IF;

  SELECT
    COALESCE(NULLIF(v_staff_day ->> 'open', ''), NULLIF(v_clinic_day ->> 'open', ''), NULLIF(v_clinic_settings ->> 'day_start', ''), '09:00'),
    COALESCE(NULLIF(v_staff_day ->> 'close', ''), NULLIF(v_clinic_day ->> 'close', ''), NULLIF(v_clinic_settings ->> 'day_end', ''), '17:00'),
    COALESCE(NULLIF(v_clinic_settings ->> 'slot_interval_minutes', '')::INTEGER, 15),
    COALESCE(NULLIF(v_clinic_settings ->> 'slot_capacity_per_staff', '')::INTEGER, 1),
    COALESCE(NULLIF(v_clinic_settings ->> 'eta_buffer_minutes', '')::INTEGER, 0)
  INTO
    v_day_start,
    v_day_end,
    v_slot_interval,
    v_capacity,
    v_buffer;

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
      AND a.staff_id = p_staff_id
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

  RETURN public.get_available_slots(p_clinic_id, p_staff_id, p_appointment_date, p_appointment_type);
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

CREATE OR REPLACE FUNCTION public.create_appointment_with_validation(
  p_clinic_id UUID,
  p_patient_id UUID,
  p_staff_id UUID,
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
BEGIN
  v_result := public.create_appointment_for_mode(
    p_clinic_id := p_clinic_id,
    p_patient_id := p_patient_id,
    p_staff_id := p_staff_id,
    p_appointment_date := p_appointment_date,
    p_scheduled_time := p_scheduled_time,
    p_appointment_type := p_appointment_type,
    p_reason_for_visit := p_reason
  );

  v_appointment_id := (v_result->>'appointment_id')::UUID;

  RETURN jsonb_build_object(
    'success', true,
    'appointmentId', v_appointment_id,
    'queuePosition', (v_result->>'queue_position')::INTEGER,
    'staffId', p_staff_id
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

  IF p_staff_id IS NULL THEN
    RAISE EXCEPTION 'staff_id is required';
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

GRANT EXECUTE ON FUNCTION public.check_appointment_availability(UUID, UUID, DATE, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_available_slots(UUID, UUID, DATE, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_available_slots_for_mode(UUID, UUID, DATE, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_appointment_for_mode(UUID, UUID, UUID, DATE, TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_appointment_with_validation(UUID, UUID, UUID, DATE, TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_queue_entry(UUID, UUID, UUID, UUID, BOOLEAN, TEXT, BOOLEAN, TEXT, TEXT) TO authenticated;
