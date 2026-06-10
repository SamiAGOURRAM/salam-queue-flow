-- Doctor overrides runtime smoke verification
-- Validates:
-- 1) doctor daily queue-mode override takes precedence over clinic defaults
-- 2) fallback to clinic defaults when doctor override is null
-- 3) booking slot payload and personal schedule payload expose effective mode correctly
--
-- Usage:
--   Get-Content -Raw "supabase/snippets/verify_doctor_overrides_runtime_smoke.sql" |
--     docker exec -i supabase_db_salam-queue-flow psql -v ON_ERROR_STOP=1 -U postgres -d postgres
--
-- Non-destructive: all fixture writes are wrapped in a transaction and rolled back.

\set ON_ERROR_STOP on

BEGIN;

DO $$
DECLARE
  v_owner_user UUID := gen_random_uuid();
  v_doctor_user UUID := gen_random_uuid();
  v_clinic_id UUID := gen_random_uuid();
  v_staff_id UUID := gen_random_uuid();
  v_target_date DATE := CURRENT_DATE;
  v_mode TEXT;
  v_payload JSONB;
  v_schedule JSON;
  v_fluid_modes JSONB := jsonb_build_object(
    'monday', 'fluid',
    'tuesday', 'fluid',
    'wednesday', 'fluid',
    'thursday', 'fluid',
    'friday', 'fluid',
    'saturday', 'fluid',
    'sunday', 'fluid'
  );
  v_slotted_modes JSONB := jsonb_build_object(
    'monday', 'slotted',
    'tuesday', 'slotted',
    'wednesday', 'slotted',
    'thursday', 'slotted',
    'friday', 'slotted',
    'saturday', 'slotted',
    'sunday', 'slotted'
  );
BEGIN
  INSERT INTO auth.users (id)
  VALUES (v_owner_user), (v_doctor_user)
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.clinics (
    id,
    owner_id,
    name,
    specialty,
    address,
    city,
    phone,
    is_active,
    queue_mode,
    settings
  ) VALUES (
    v_clinic_id,
    v_owner_user,
    'Doctor Override Runtime Smoke Clinic',
    'General Medicine',
    '1 Runtime Smoke Avenue',
    'Rabat',
    '+212600009999',
    true,
    'slotted',
    jsonb_build_object('daily_queue_modes', v_slotted_modes)
  );

  INSERT INTO public.user_roles (user_id, role, clinic_id)
  VALUES
    (v_owner_user, 'clinic_owner', v_clinic_id),
    (v_doctor_user, 'staff', v_clinic_id);

  INSERT INTO public.clinic_staff (
    id,
    clinic_id,
    user_id,
    role,
    is_active,
    daily_queue_modes_override
  ) VALUES (
    v_staff_id,
    v_clinic_id,
    v_doctor_user,
    'doctor',
    true,
    v_fluid_modes
  );

  SELECT public.get_effective_queue_mode_for_staff(v_clinic_id, v_staff_id, v_target_date)
  INTO v_mode;

  IF v_mode <> 'fluid' THEN
    RAISE EXCEPTION 'Expected doctor override mode fluid, got %', v_mode;
  END IF;

  SELECT public.get_queue_mode_for_staff(v_clinic_id, v_staff_id, v_target_date)
  INTO v_mode;

  IF v_mode <> 'fluid' THEN
    RAISE EXCEPTION 'Expected alias function mode fluid, got %', v_mode;
  END IF;

  SELECT public.get_available_slots_for_mode(v_clinic_id, v_staff_id, v_target_date, 'consultation')
  INTO v_payload;

  IF COALESCE(v_payload->>'mode', '') <> 'fluid' THEN
    RAISE EXCEPTION 'Expected booking mode payload fluid under override, got %', v_payload;
  END IF;

  UPDATE public.clinic_staff
  SET daily_queue_modes_override = NULL
  WHERE id = v_staff_id;

  SELECT public.get_effective_queue_mode_for_staff(v_clinic_id, v_staff_id, v_target_date)
  INTO v_mode;

  IF v_mode <> 'slotted' THEN
    RAISE EXCEPTION 'Expected clinic fallback mode slotted, got %', v_mode;
  END IF;

  SELECT public.get_available_slots_for_mode(v_clinic_id, v_staff_id, v_target_date, 'consultation')
  INTO v_payload;

  IF COALESCE(v_payload->>'mode', '') <> 'slotted' THEN
    RAISE EXCEPTION 'Expected booking mode payload fallback slotted, got %', v_payload;
  END IF;

  PERFORM set_config('request.jwt.claim.role', 'authenticated', false);
  PERFORM set_config('request.jwt.claim.sub', v_doctor_user::text, false);

  SELECT public.get_daily_schedule_for_staff(v_staff_id, v_target_date::text)
  INTO v_schedule;

  IF COALESCE(v_schedule->>'queue_mode', '') <> 'slotted' THEN
    RAISE EXCEPTION 'Expected personal schedule queue_mode slotted after fallback, got %', v_schedule;
  END IF;

  UPDATE public.clinic_staff
  SET daily_queue_modes_override = v_fluid_modes
  WHERE id = v_staff_id;

  SELECT public.get_daily_schedule_for_staff(v_staff_id, v_target_date::text)
  INTO v_schedule;

  IF COALESCE(v_schedule->>'queue_mode', '') <> 'fluid' THEN
    RAISE EXCEPTION 'Expected personal schedule queue_mode fluid with override, got %', v_schedule;
  END IF;

  RAISE NOTICE 'PASS doctor override runtime smoke (override precedence + clinic fallback)';
END
$$;

ROLLBACK;
