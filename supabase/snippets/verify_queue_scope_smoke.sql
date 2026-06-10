-- Queue scope smoke verification
-- Validates:
-- 1) restricted receptionist sees only assigned provider queues
-- 2) provider is forced to personal queue scope
-- 3) owner can access both clinic-wide and provider-specific queue views
--
-- Usage:
--   Get-Content -Raw "supabase/snippets/verify_queue_scope_smoke.sql" |
--     docker exec -i supabase_db_salam-queue-flow psql -v ON_ERROR_STOP=1 -U postgres -d postgres
--
-- Non-destructive: all inserts run inside a transaction and are rolled back.

\set ON_ERROR_STOP on

BEGIN;

SELECT
  set_config('qscope.owner_user', gen_random_uuid()::text, true),
  set_config('qscope.provider1_user', gen_random_uuid()::text, true),
  set_config('qscope.provider2_user', gen_random_uuid()::text, true),
  set_config('qscope.reception_user', gen_random_uuid()::text, true),
  set_config('qscope.clinic_id', gen_random_uuid()::text, true),
  set_config('qscope.owner_staff_id', gen_random_uuid()::text, true),
  set_config('qscope.provider1_staff_id', gen_random_uuid()::text, true),
  set_config('qscope.provider2_staff_id', gen_random_uuid()::text, true),
  set_config('qscope.reception_staff_id', gen_random_uuid()::text, true),
  set_config('qscope.patient_id', gen_random_uuid()::text, true),
  set_config('qscope.appt1_id', gen_random_uuid()::text, true),
  set_config('qscope.appt2_id', gen_random_uuid()::text, true);

INSERT INTO auth.users (id)
VALUES
  (current_setting('qscope.owner_user')::uuid),
  (current_setting('qscope.provider1_user')::uuid),
  (current_setting('qscope.provider2_user')::uuid),
  (current_setting('qscope.reception_user')::uuid)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.clinics (id, owner_id, name, specialty, address, city, phone, is_active)
VALUES (
  current_setting('qscope.clinic_id')::uuid,
  current_setting('qscope.owner_user')::uuid,
  'Queue Scope Smoke Clinic',
  'General Medicine',
  '1 Queue Scope Street',
  'Rabat',
  '+212600002000',
  true
);

INSERT INTO public.user_roles (user_id, role, clinic_id)
VALUES
  (current_setting('qscope.owner_user')::uuid, 'clinic_owner', current_setting('qscope.clinic_id')::uuid),
  (current_setting('qscope.provider1_user')::uuid, 'staff', current_setting('qscope.clinic_id')::uuid),
  (current_setting('qscope.provider2_user')::uuid, 'staff', current_setting('qscope.clinic_id')::uuid),
  (current_setting('qscope.reception_user')::uuid, 'staff', current_setting('qscope.clinic_id')::uuid);

INSERT INTO public.clinic_staff (id, clinic_id, user_id, role, is_active)
VALUES
  (
    current_setting('qscope.owner_staff_id')::uuid,
    current_setting('qscope.clinic_id')::uuid,
    current_setting('qscope.owner_user')::uuid,
    'doctor',
    true
  ),
  (
    current_setting('qscope.provider1_staff_id')::uuid,
    current_setting('qscope.clinic_id')::uuid,
    current_setting('qscope.provider1_user')::uuid,
    'doctor',
    true
  ),
  (
    current_setting('qscope.provider2_staff_id')::uuid,
    current_setting('qscope.clinic_id')::uuid,
    current_setting('qscope.provider2_user')::uuid,
    'doctor',
    true
  ),
  (
    current_setting('qscope.reception_staff_id')::uuid,
    current_setting('qscope.clinic_id')::uuid,
    current_setting('qscope.reception_user')::uuid,
    'staff',
    true
  );

INSERT INTO public.patients (
  id,
  user_id,
  display_name,
  full_name_encrypted,
  phone_number_encrypted,
  email_encrypted,
  phone_number_hash,
  source,
  is_claimed,
  is_anonymized,
  created_by,
  consent_sms,
  consent_data_processing
) VALUES (
  current_setting('qscope.patient_id')::uuid,
  NULL,
  'Queue Scope Patient',
  public.encrypt_patient_pii('Queue Scope Patient'),
  public.encrypt_patient_pii('+212600002001'),
  public.encrypt_patient_pii('qscope.patient@example.com'),
  public.hash_phone_number('+212600002001'),
  'walk_in',
  false,
  false,
  current_setting('qscope.owner_user')::uuid,
  true,
  true
);

INSERT INTO public.appointments (
  id,
  clinic_id,
  patient_id,
  staff_id,
  appointment_date,
  appointment_type,
  status,
  is_present,
  queue_position,
  reason_for_visit,
  notes,
  actual_duration
)
VALUES
(
  current_setting('qscope.appt1_id')::uuid,
  current_setting('qscope.clinic_id')::uuid,
  current_setting('qscope.patient_id')::uuid,
  current_setting('qscope.provider1_staff_id')::uuid,
  CURRENT_DATE,
  'consultation',
  'waiting',
  true,
  1,
  'Scope check provider 1',
  'n/a',
  15
),
(
  current_setting('qscope.appt2_id')::uuid,
  current_setting('qscope.clinic_id')::uuid,
  current_setting('qscope.patient_id')::uuid,
  current_setting('qscope.provider2_staff_id')::uuid,
  CURRENT_DATE,
  'consultation',
  'waiting',
  true,
  2,
  'Scope check provider 2',
  'n/a',
  15
);

-- Assign receptionist to provider1 only.
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SELECT set_config('request.jwt.claim.sub', current_setting('qscope.owner_user'), true);
SELECT public.replace_staff_queue_assignments(
  current_setting('qscope.reception_staff_id')::uuid,
  ARRAY[current_setting('qscope.provider1_staff_id')::uuid]
);

-- Scenario A: restricted receptionist assigned doctors only.
SELECT set_config('request.jwt.claim.sub', current_setting('qscope.reception_user'), true);
DO $$
DECLARE
  v_scope JSONB;
  v_allowed_count INT;
  v_provider1_count INT;
BEGIN
  v_scope := public.resolve_queue_scope_for_staff(current_setting('qscope.reception_staff_id')::uuid);

  IF COALESCE(v_scope->>'scope_mode', '') <> 'restricted' THEN
    RAISE EXCEPTION 'Scenario A failed: expected restricted scope, got %', v_scope;
  END IF;

  v_allowed_count := COALESCE(jsonb_array_length(v_scope->'allowed_staff_ids'), 0);
  IF v_allowed_count <> 1 OR COALESCE(v_scope->'allowed_staff_ids'->>0, '') <> current_setting('qscope.provider1_staff_id') THEN
    RAISE EXCEPTION 'Scenario A failed: allowed_staff_ids mismatch: %', v_scope;
  END IF;

  SELECT COALESCE(json_array_length(public.get_daily_schedule_for_staff(current_setting('qscope.provider1_staff_id')::uuid, CURRENT_DATE::text)->'schedule'), 0)
  INTO v_provider1_count;

  IF v_provider1_count < 1 THEN
    RAISE EXCEPTION 'Scenario A failed: expected provider1 schedule access';
  END IF;

  BEGIN
    PERFORM public.get_daily_schedule_for_staff(current_setting('qscope.provider2_staff_id')::uuid, CURRENT_DATE::text);
    RAISE EXCEPTION 'Scenario A failed: provider2 schedule should be blocked';
  EXCEPTION
    WHEN OTHERS THEN
      IF POSITION('not allowed' IN lower(SQLERRM)) = 0 THEN
        RAISE;
      END IF;
  END;

  RAISE NOTICE 'PASS Scenario A (restricted receptionist)';
END;
$$;

-- Scenario B: provider forced personal queue.
SELECT set_config('request.jwt.claim.sub', current_setting('qscope.provider1_user'), true);
DO $$
DECLARE
  v_scope JSONB;
  v_provider_count INT;
BEGIN
  v_scope := public.resolve_queue_scope_for_staff(current_setting('qscope.provider1_staff_id')::uuid);

  IF COALESCE(v_scope->>'scope_mode', '') <> 'provider' THEN
    RAISE EXCEPTION 'Scenario B failed: expected provider scope, got %', v_scope;
  END IF;

  IF COALESCE((v_scope->>'is_clinic_wide')::BOOLEAN, true) <> false THEN
    RAISE EXCEPTION 'Scenario B failed: provider should not be clinic-wide: %', v_scope;
  END IF;

  SELECT COALESCE(json_array_length(public.get_daily_schedule_for_staff(current_setting('qscope.provider1_staff_id')::uuid, CURRENT_DATE::text)->'schedule'), 0)
  INTO v_provider_count;

  IF v_provider_count < 1 THEN
    RAISE EXCEPTION 'Scenario B failed: provider personal schedule should be accessible';
  END IF;

  BEGIN
    PERFORM public.get_daily_schedule_for_clinic(current_setting('qscope.clinic_id')::uuid, CURRENT_DATE);
    RAISE EXCEPTION 'Scenario B failed: provider clinic-wide access should be blocked';
  EXCEPTION
    WHEN OTHERS THEN
      IF POSITION('clinic-wide queue scope' IN lower(SQLERRM)) = 0 THEN
        RAISE;
      END IF;
  END;

  RAISE NOTICE 'PASS Scenario B (provider forced personal queue)';
END;
$$;

-- Scenario C: owner clinic-wide plus personal toggle behavior.
SELECT set_config('request.jwt.claim.sub', current_setting('qscope.owner_user'), true);
DO $$
DECLARE
  v_scope JSONB;
  v_clinic_count INT;
  v_provider1_count INT;
BEGIN
  v_scope := public.resolve_queue_scope_for_staff(current_setting('qscope.owner_staff_id')::uuid);

  IF COALESCE(v_scope->>'scope_mode', '') <> 'clinic' THEN
    RAISE EXCEPTION 'Scenario C failed: owner scope should resolve to clinic, got %', v_scope;
  END IF;

  IF COALESCE((v_scope->>'is_clinic_wide')::BOOLEAN, false) <> true THEN
    RAISE EXCEPTION 'Scenario C failed: owner should be clinic-wide: %', v_scope;
  END IF;

  SELECT COALESCE(json_array_length(public.get_daily_schedule_for_clinic(current_setting('qscope.clinic_id')::uuid, CURRENT_DATE)->'schedule'), 0)
  INTO v_clinic_count;

  IF v_clinic_count <> 2 THEN
    RAISE EXCEPTION 'Scenario C failed: expected clinic-wide schedule size 2, got %', v_clinic_count;
  END IF;

  SELECT COALESCE(json_array_length(public.get_daily_schedule_for_staff(current_setting('qscope.provider1_staff_id')::uuid, CURRENT_DATE::text)->'schedule'), 0)
  INTO v_provider1_count;

  IF v_provider1_count <> 1 THEN
    RAISE EXCEPTION 'Scenario C failed: owner should access provider personal schedule, got %', v_provider1_count;
  END IF;

  RAISE NOTICE 'PASS Scenario C (owner clinic-wide + personal toggle path)';
END;
$$;

ROLLBACK;
