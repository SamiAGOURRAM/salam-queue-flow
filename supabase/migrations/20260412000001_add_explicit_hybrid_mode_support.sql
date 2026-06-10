-- Migration: Re-introduce explicit hybrid queue mode support
-- Purpose:
-- - Add hybrid as a first-class queue mode (clinic + per-day + per-doctor override).
-- - Keep backward compatibility for legacy fixed mode by mapping fixed -> slotted.
-- - Support hybrid in booking RPCs (slot optional, slot validation when provided).

ALTER TABLE public.clinics
  DROP CONSTRAINT IF EXISTS clinics_queue_mode_check;

ALTER TABLE public.clinics
  ADD CONSTRAINT clinics_queue_mode_check CHECK (
    queue_mode IN ('slotted', 'fluid', 'hybrid')
  );

CREATE OR REPLACE FUNCTION public.get_effective_queue_mode(p_clinic_id uuid, p_date date)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_settings jsonb;
  v_queue_mode text;
  v_day_name text;
  v_day_mode text;
BEGIN
  SELECT settings, queue_mode
  INTO v_settings, v_queue_mode
  FROM public.clinics
  WHERE id = p_clinic_id;

  IF v_settings IS NULL THEN
    IF v_queue_mode = 'fixed' THEN
      RETURN 'slotted';
    END IF;

    RETURN COALESCE(v_queue_mode, 'fluid');
  END IF;

  v_day_name := lower(trim(to_char(p_date, 'Day')));

  IF v_settings ? 'daily_queue_modes' THEN
    v_day_mode := v_settings #>> ARRAY['daily_queue_modes', v_day_name];

    IF v_day_mode = 'fixed' THEN
      v_day_mode := 'slotted';
    END IF;

    IF v_day_mode IN ('slotted', 'fluid', 'hybrid') THEN
      RETURN v_day_mode;
    END IF;
  END IF;

  IF v_queue_mode = 'fixed' THEN
    RETURN 'slotted';
  END IF;

  RETURN COALESCE(v_queue_mode, 'fluid');
END;
$$;

COMMENT ON FUNCTION public.get_effective_queue_mode IS
'Returns effective queue mode by date with support for slotted/fluid/hybrid and legacy fixed -> slotted mapping.';

CREATE OR REPLACE FUNCTION public.recalculate_queue_positions(p_clinic_id uuid, p_appointment_date date)
RETURNS void
LANGUAGE plpgsql
AS $function$
DECLARE
  v_mode text;
BEGIN
  v_mode := public.get_effective_queue_mode(p_clinic_id, p_appointment_date);

  WITH ranked_queue AS (
    SELECT
      a.id,
      ROW_NUMBER() OVER (
        ORDER BY
          CASE
            WHEN v_mode = 'fluid' THEN 1
            WHEN v_mode = 'hybrid' AND a.scheduled_time IS NULL THEN 2
            ELSE 0
          END ASC,
          CASE
            WHEN v_mode = 'fluid' THEN COALESCE(a.priority_score, 0)
            WHEN v_mode = 'hybrid' AND a.scheduled_time IS NULL THEN COALESCE(a.priority_score, 0)
            ELSE NULL
          END DESC NULLS LAST,
          COALESCE(a.scheduled_time::time, '23:59:59'::time) ASC,
          a.created_at ASC
      ) AS new_position
    FROM public.appointments a
    WHERE a.clinic_id = p_clinic_id
      AND a.appointment_date = p_appointment_date
      AND a.status IN ('scheduled', 'waiting')
      AND (a.skip_reason IS NULL OR a.skip_reason <> 'patient_absent')
  )
  UPDATE public.appointments a
  SET queue_position = rq.new_position
  FROM ranked_queue rq
  WHERE a.id = rq.id;

  UPDATE public.appointments
  SET queue_position = NULL
  WHERE clinic_id = p_clinic_id
    AND appointment_date = p_appointment_date
    AND (
      status NOT IN ('scheduled', 'waiting')
      OR skip_reason = 'patient_absent'
    );
END;
$function$;

COMMENT ON COLUMN public.clinic_staff.daily_queue_modes_override IS
  'Optional doctor-level daily queue mode override map by day key (monday..sunday) with values fluid/slotted/hybrid.';

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

    IF v_staff_day_mode IN ('fluid', 'slotted', 'hybrid') THEN
      RETURN v_staff_day_mode;
    END IF;
  END IF;

  RETURN public.get_effective_queue_mode(p_clinic_id, p_date);
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
  ELSIF v_mode = 'hybrid' THEN
    IF p_scheduled_time IS NOT NULL THEN
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
    ((v_mode = 'fluid' OR v_mode = 'hybrid') AND p_scheduled_time IS NULL),
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

GRANT EXECUTE ON FUNCTION public.get_effective_queue_mode(uuid, date) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_effective_queue_mode_for_staff(UUID, UUID, DATE) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_available_slots_for_mode(UUID, UUID, DATE, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_appointment_for_mode(UUID, UUID, UUID, DATE, TEXT, TEXT, TEXT) TO authenticated;
