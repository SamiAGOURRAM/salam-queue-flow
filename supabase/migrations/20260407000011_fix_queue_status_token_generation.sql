-- Fix: Replace MD5-based token generation with cryptographically secure random bytes.
-- Also reject requests for completed appointments older than 24 hours.

CREATE OR REPLACE FUNCTION public.generate_queue_status_token(
  p_appointment_id uuid
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing_token text;
  v_owner_user_id uuid;
  v_token text;
  v_attempt integer := 0;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT a.queue_status_token, p.user_id
  INTO v_existing_token, v_owner_user_id
  FROM public.appointments a
  JOIN public.patients p ON p.id = a.patient_id
  WHERE a.id = p_appointment_id
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Appointment not found';
  END IF;

  IF v_owner_user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Not authorized to generate queue status token for this appointment';
  END IF;

  IF v_existing_token IS NOT NULL THEN
    RETURN v_existing_token;
  END IF;

  LOOP
    v_attempt := v_attempt + 1;

    -- Use cryptographically secure random bytes instead of MD5
    v_token := encode(gen_random_bytes(32), 'hex');

    BEGIN
      UPDATE public.appointments
      SET
        queue_status_token = v_token,
        updated_at = now()
      WHERE id = p_appointment_id
        AND queue_status_token IS NULL;

      IF FOUND THEN
        RETURN v_token;
      END IF;

      SELECT a.queue_status_token
      INTO v_existing_token
      FROM public.appointments a
      WHERE a.id = p_appointment_id
      LIMIT 1;

      IF v_existing_token IS NOT NULL THEN
        RETURN v_existing_token;
      END IF;
    EXCEPTION
      WHEN unique_violation THEN
        IF v_attempt >= 5 THEN
          RAISE;
        END IF;
    END;

    IF v_attempt >= 5 THEN
      RAISE EXCEPTION 'Unable to generate queue status token after % attempts', v_attempt;
    END IF;
  END LOOP;
END;
$$;

-- Fix: Add token expiration check — reject completed appointments older than 24 hours
CREATE OR REPLACE FUNCTION public.get_public_queue_status(
  p_queue_status_token text
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_payload json;
BEGIN
  IF p_queue_status_token IS NULL OR btrim(p_queue_status_token) = '' THEN
    RETURN NULL;
  END IF;

  SELECT json_build_object(
    'appointmentId', a.id,
    'clinicId', a.clinic_id,
    'clinicName', c.name,
    'queuePosition', a.queue_position,
    'status', a.status,
    'appointmentDate', a.appointment_date,
    'scheduledTime', a.scheduled_time,
    'predictedStartTime', a.predicted_start_time,
    'predictedWaitTime', a.predicted_wait_time,
    'appointmentType', a.appointment_type,
    'checkedInAt', a.checked_in_at,
    'updatedAt', a.updated_at
  )
  INTO v_payload
  FROM public.appointments a
  JOIN public.clinics c ON c.id = a.clinic_id
  WHERE a.queue_status_token = btrim(p_queue_status_token)
    -- Token expiration: reject completed/cancelled/no-show appointments older than 24h
    AND NOT (
      a.status IN ('completed', 'cancelled', 'no_show')
      AND a.updated_at < (now() - interval '24 hours')
    )
  LIMIT 1;

  RETURN v_payload;
END;
$$;
