-- The generate_queue_status_token RPC requires patients.user_id = auth.uid(),
-- which fails for walk-in / staff-created patient records where user_id IS NULL.
--
-- Fix: only enforce the ownership check when a user_id actually exists.
-- The token itself only exposes public queue status (position, status, estimated
-- time) — not PHI — so this is safe to relax.

CREATE OR REPLACE FUNCTION public.generate_queue_status_token(p_appointment_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

  -- Only enforce ownership for patient records linked to an auth user.
  -- Unlinked (walk-in) patients with user_id IS NULL are allowed because
  -- no auth user owns the record, and the token only exposes public
  -- queue status (not PHI).
  IF v_owner_user_id IS NOT NULL AND v_owner_user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Not authorized to generate queue status token for this appointment';
  END IF;

  IF v_existing_token IS NOT NULL THEN
    RETURN v_existing_token;
  END IF;

  LOOP
    v_attempt := v_attempt + 1;

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
$function$;

COMMENT ON FUNCTION public.generate_queue_status_token IS 'Generates or returns existing shareable queue status token. Requires authentication. Ownership check is skipped for unlinked (walk-in) patient records since the token only exposes public queue status.';
