-- Staff queue assignment constraint/guard smoke verification
-- Validates:
-- 1) staff_queue_assignments rejects non-provider assignments and duplicate links
-- 2) replace_staff_queue_assignments enforces target-role and assigned-provider guards
-- 3) assignment management is owner-only (RPC + direct table writes)
-- 4) restricted scope guards block unauthorized provider schedule access
--
-- Usage:
--   Get-Content -Raw "supabase/snippets/verify_staff_queue_assignments_guards.sql" |
--     docker exec -i supabase_db_salam-queue-flow psql -v ON_ERROR_STOP=1 -U postgres -d postgres
--
-- Non-destructive: all inserts run inside a transaction and are rolled back.

\set ON_ERROR_STOP on

BEGIN;

SELECT
  set_config('qassign.owner_user', gen_random_uuid()::text, true),
  set_config('qassign.provider1_user', gen_random_uuid()::text, true),
  set_config('qassign.provider2_user', gen_random_uuid()::text, true),
  set_config('qassign.reception_user', gen_random_uuid()::text, true),
  set_config('qassign.outsider_user', gen_random_uuid()::text, true),
  set_config('qassign.clinic_id', gen_random_uuid()::text, true),
  set_config('qassign.owner_staff_id', gen_random_uuid()::text, true),
  set_config('qassign.provider1_staff_id', gen_random_uuid()::text, true),
  set_config('qassign.provider2_staff_id', gen_random_uuid()::text, true),
  set_config('qassign.reception_staff_id', gen_random_uuid()::text, true),
  set_config('qassign.patient_id', gen_random_uuid()::text, true),
  set_config('qassign.appt1_id', gen_random_uuid()::text, true),
  set_config('qassign.appt2_id', gen_random_uuid()::text, true);

INSERT INTO auth.users (id)
VALUES
  (current_setting('qassign.owner_user')::uuid),
  (current_setting('qassign.provider1_user')::uuid),
  (current_setting('qassign.provider2_user')::uuid),
  (current_setting('qassign.reception_user')::uuid),
  (current_setting('qassign.outsider_user')::uuid)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.clinics (id, owner_id, name, specialty, address, city, phone, is_active)
VALUES (
  current_setting('qassign.clinic_id')::uuid,
  current_setting('qassign.owner_user')::uuid,
  'Queue Assignment Guard Clinic',
  'General Medicine',
  '2 Queue Guard Avenue',
  'Casablanca',
  '+212600002100',
  true
);

INSERT INTO public.user_roles (user_id, role, clinic_id)
VALUES
  (current_setting('qassign.owner_user')::uuid, 'clinic_owner', current_setting('qassign.clinic_id')::uuid),
  (current_setting('qassign.provider1_user')::uuid, 'staff', current_setting('qassign.clinic_id')::uuid),
  (current_setting('qassign.provider2_user')::uuid, 'staff', current_setting('qassign.clinic_id')::uuid),
  (current_setting('qassign.reception_user')::uuid, 'staff', current_setting('qassign.clinic_id')::uuid);

INSERT INTO public.clinic_staff (id, clinic_id, user_id, role, is_active)
VALUES
  (
    current_setting('qassign.owner_staff_id')::uuid,
    current_setting('qassign.clinic_id')::uuid,
    current_setting('qassign.owner_user')::uuid,
    'doctor',
    true
  ),
  (
    current_setting('qassign.provider1_staff_id')::uuid,
    current_setting('qassign.clinic_id')::uuid,
    current_setting('qassign.provider1_user')::uuid,
    'doctor',
    true
  ),
  (
    current_setting('qassign.provider2_staff_id')::uuid,
    current_setting('qassign.clinic_id')::uuid,
    current_setting('qassign.provider2_user')::uuid,
    'doctor',
    true
  ),
  (
    current_setting('qassign.reception_staff_id')::uuid,
    current_setting('qassign.clinic_id')::uuid,
    current_setting('qassign.reception_user')::uuid,
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
  current_setting('qassign.patient_id')::uuid,
  NULL,
  'Queue Assignment Patient',
  public.encrypt_patient_pii('Queue Assignment Patient'),
  public.encrypt_patient_pii('+212600002101'),
  public.encrypt_patient_pii('qassign.patient@example.com'),
  public.hash_phone_number('+212600002101'),
  'walk_in',
  false,
  false,
  current_setting('qassign.owner_user')::uuid,
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
  current_setting('qassign.appt1_id')::uuid,
  current_setting('qassign.clinic_id')::uuid,
  current_setting('qassign.patient_id')::uuid,
  current_setting('qassign.provider1_staff_id')::uuid,
  CURRENT_DATE,
  'consultation',
  'waiting',
  true,
  1,
  'Guard check provider 1',
  'n/a',
  15
),
(
  current_setting('qassign.appt2_id')::uuid,
  current_setting('qassign.clinic_id')::uuid,
  current_setting('qassign.patient_id')::uuid,
  current_setting('qassign.provider2_staff_id')::uuid,
  CURRENT_DATE,
  'consultation',
  'waiting',
  true,
  2,
  'Guard check provider 2',
  'n/a',
  15
);

SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SELECT set_config('request.jwt.claim.sub', current_setting('qassign.owner_user'), true);

-- Seed one valid assignment link for constraint tests.
INSERT INTO public.staff_queue_assignments (clinic_id, staff_id, assigned_staff_id, created_by)
VALUES (
  current_setting('qassign.clinic_id')::uuid,
  current_setting('qassign.reception_staff_id')::uuid,
  current_setting('qassign.provider1_staff_id')::uuid,
  current_setting('qassign.owner_user')::uuid
);

DO $$
BEGIN
  BEGIN
    INSERT INTO public.staff_queue_assignments (clinic_id, staff_id, assigned_staff_id, created_by)
    VALUES (
      current_setting('qassign.clinic_id')::uuid,
      current_setting('qassign.reception_staff_id')::uuid,
      current_setting('qassign.reception_staff_id')::uuid,
      current_setting('qassign.owner_user')::uuid
    );
    RAISE EXCEPTION 'Expected non-provider assignment insert to fail';
  EXCEPTION
    WHEN OTHERS THEN
      IF POSITION('provider role' IN lower(SQLERRM)) = 0 THEN
        RAISE;
      END IF;
  END;

  BEGIN
    INSERT INTO public.staff_queue_assignments (clinic_id, staff_id, assigned_staff_id, created_by)
    VALUES (
      current_setting('qassign.clinic_id')::uuid,
      current_setting('qassign.reception_staff_id')::uuid,
      current_setting('qassign.provider1_staff_id')::uuid,
      current_setting('qassign.owner_user')::uuid
    );
    RAISE EXCEPTION 'Expected duplicate assignment insert to fail';
  EXCEPTION
    WHEN unique_violation THEN
      NULL;
  END;

  RAISE NOTICE 'PASS Scenario A (table constraint guards)';
END;
$$;

DO $$
BEGIN
  BEGIN
    PERFORM public.replace_staff_queue_assignments(
      current_setting('qassign.provider1_staff_id')::uuid,
      ARRAY[current_setting('qassign.provider2_staff_id')::uuid]
    );
    RAISE EXCEPTION 'Expected provider target replace to fail';
  EXCEPTION
    WHEN OTHERS THEN
      IF POSITION('provider roles manage their own queue scope' IN lower(SQLERRM)) = 0 THEN
        RAISE;
      END IF;
  END;

  BEGIN
    PERFORM public.replace_staff_queue_assignments(
      current_setting('qassign.reception_staff_id')::uuid,
      ARRAY[current_setting('qassign.reception_staff_id')::uuid]
    );
    RAISE EXCEPTION 'Expected invalid assigned staff replace to fail';
  EXCEPTION
    WHEN OTHERS THEN
      IF POSITION('invalid, inactive, or not provider roles' IN lower(SQLERRM)) = 0 THEN
        RAISE;
      END IF;
  END;

  -- Valid replacement to set restricted scope to provider1 only.
  PERFORM public.replace_staff_queue_assignments(
    current_setting('qassign.reception_staff_id')::uuid,
    ARRAY[current_setting('qassign.provider1_staff_id')::uuid]
  );

  RAISE NOTICE 'PASS Scenario B (replace_staff_queue_assignments guards)';
END;
$$;

SET LOCAL ROLE authenticated;

DO $$
BEGIN
  PERFORM set_config('request.jwt.claim.sub', current_setting('qassign.reception_user'), true);

  BEGIN
    PERFORM public.replace_staff_queue_assignments(
      current_setting('qassign.reception_staff_id')::uuid,
      ARRAY[current_setting('qassign.provider2_staff_id')::uuid]
    );
    RAISE EXCEPTION 'Expected receptionist replace to fail';
  EXCEPTION
    WHEN OTHERS THEN
      IF POSITION('only clinic owners can manage queue assignments' IN lower(SQLERRM)) = 0 THEN
        RAISE;
      END IF;
  END;

  BEGIN
    INSERT INTO public.staff_queue_assignments (clinic_id, staff_id, assigned_staff_id, created_by)
    VALUES (
      current_setting('qassign.clinic_id')::uuid,
      current_setting('qassign.reception_staff_id')::uuid,
      current_setting('qassign.provider2_staff_id')::uuid,
      current_setting('qassign.reception_user')::uuid
    );
    RAISE EXCEPTION 'Expected receptionist direct insert to fail';
  EXCEPTION
    WHEN insufficient_privilege THEN
      NULL;
    WHEN OTHERS THEN
      IF POSITION('row-level security' IN lower(SQLERRM)) = 0 THEN
        RAISE;
      END IF;
  END;

  PERFORM set_config('request.jwt.claim.sub', current_setting('qassign.outsider_user'), true);

  BEGIN
    PERFORM public.replace_staff_queue_assignments(
      current_setting('qassign.reception_staff_id')::uuid,
      ARRAY[current_setting('qassign.provider2_staff_id')::uuid]
    );
    RAISE EXCEPTION 'Expected outsider replace to fail';
  EXCEPTION
    WHEN OTHERS THEN
      IF POSITION('only clinic owners can manage queue assignments' IN lower(SQLERRM)) = 0 THEN
        RAISE;
      END IF;
  END;

  RAISE NOTICE 'PASS Scenario C (assignment admin authorization guard)';
END;
$$;

SELECT set_config('request.jwt.claim.sub', current_setting('qassign.reception_user'), true);
DO $$
DECLARE
  v_scope JSONB;
  v_allowed_count INTEGER;
  v_provider1_count INTEGER;
BEGIN
  v_scope := public.resolve_queue_scope_for_staff(current_setting('qassign.reception_staff_id')::uuid);

  IF COALESCE(v_scope->>'scope_mode', '') <> 'restricted' THEN
    RAISE EXCEPTION 'Scenario D failed: expected restricted scope, got %', v_scope;
  END IF;

  v_allowed_count := COALESCE(jsonb_array_length(v_scope->'allowed_staff_ids'), 0);
  IF v_allowed_count <> 1 OR COALESCE(v_scope->'allowed_staff_ids'->>0, '') <> current_setting('qassign.provider1_staff_id') THEN
    RAISE EXCEPTION 'Scenario D failed: allowed_staff_ids mismatch: %', v_scope;
  END IF;

  SELECT COALESCE(json_array_length(public.get_daily_schedule_for_doctors(
    current_setting('qassign.clinic_id')::uuid,
    CURRENT_DATE,
    ARRAY[current_setting('qassign.provider1_staff_id')::uuid]
  )->'schedule'), 0)
  INTO v_provider1_count;

  IF v_provider1_count <> 1 THEN
    RAISE EXCEPTION 'Scenario D failed: expected provider1 schedule count 1, got %', v_provider1_count;
  END IF;

  BEGIN
    PERFORM public.get_daily_schedule_for_staff(
      current_setting('qassign.provider2_staff_id')::uuid,
      CURRENT_DATE::text
    );
    RAISE EXCEPTION 'Scenario D failed: provider2 schedule should be blocked';
  EXCEPTION
    WHEN OTHERS THEN
      IF POSITION('not allowed to access this provider queue' IN lower(SQLERRM)) = 0 THEN
        RAISE;
      END IF;
  END;

  BEGIN
    PERFORM public.get_daily_schedule_for_doctors(
      current_setting('qassign.clinic_id')::uuid,
      CURRENT_DATE,
      ARRAY[
        current_setting('qassign.provider1_staff_id')::uuid,
        current_setting('qassign.provider2_staff_id')::uuid
      ]
    );
    RAISE EXCEPTION 'Scenario D failed: mixed scope doctor list should be blocked';
  EXCEPTION
    WHEN OTHERS THEN
      IF POSITION('outside your allowed scope' IN lower(SQLERRM)) = 0 THEN
        RAISE;
      END IF;
  END;

  RAISE NOTICE 'PASS Scenario D (restricted scope schedule guards)';
END;
$$;

RESET ROLE;

ROLLBACK;
