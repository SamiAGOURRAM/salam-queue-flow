-- Verifies medical_record_* RLS and RPC behavior.
-- Usage:
--   Get-Content "supabase/snippets/verify_medical_sharing_rls.sql" -Raw |
--     docker exec -i supabase_db_salam-queue-flow psql -v ON_ERROR_STOP=1 -U postgres -d postgres
--
-- Non-destructive: all changes are inside a transaction and rolled back.

\set ON_ERROR_STOP on

BEGIN;

-- Ensure at least 4 users exist for owner, doctor, patient, outsider.
DO $$
DECLARE
  v_missing integer;
BEGIN
  SELECT GREATEST(0, 4 - COUNT(*)) INTO v_missing FROM auth.users;
  IF v_missing > 0 THEN
    INSERT INTO auth.users (id)
    SELECT gen_random_uuid() FROM generate_series(1, v_missing);
  END IF;
END;
$$;

WITH users AS (
  SELECT id, row_number() OVER (ORDER BY created_at, id) AS rn
  FROM auth.users
)
SELECT
  set_config('test.owner_user_id',    (SELECT id::text FROM users WHERE rn = 1), true),
  set_config('test.doctor_user_id',   (SELECT id::text FROM users WHERE rn = 2), true),
  set_config('test.patient_user_id',  (SELECT id::text FROM users WHERE rn = 3), true),
  set_config('test.outsider_user_id', (SELECT id::text FROM users WHERE rn = 4), true);

SELECT
  set_config('test.clinic_id',         gen_random_uuid()::text, true),
  set_config('test.outsider_clinic_id',gen_random_uuid()::text, true),
  set_config('test.patient_id',        gen_random_uuid()::text, true),
  set_config('test.staff_doctor_id',   gen_random_uuid()::text, true),
  set_config('test.staff_owner_id',    gen_random_uuid()::text, true),
  set_config('test.appointment_id',    gen_random_uuid()::text, true),
  set_config('test.grant_id',          gen_random_uuid()::text, true),
  set_config('test.diag_id',           gen_random_uuid()::text, true),
  set_config('test.rx_id',             gen_random_uuid()::text, true),
  set_config('test.lab_id',            gen_random_uuid()::text, true);

INSERT INTO public.clinics (id, owner_id, name, specialty, address, city, phone, is_active)
VALUES
  (
    current_setting('test.clinic_id')::uuid,
    current_setting('test.owner_user_id')::uuid,
    'Med Share Verify Clinic',
    'General Medicine',
    '1 Verify Street',
    'Rabat',
    '+212600000011',
    true
  ),
  (
    current_setting('test.outsider_clinic_id')::uuid,
    current_setting('test.outsider_user_id')::uuid,
    'Outsider Clinic',
    'General Medicine',
    '2 Verify Street',
    'Casablanca',
    '+212600000022',
    true
  );

INSERT INTO public.user_roles (user_id, role, clinic_id)
VALUES
  (current_setting('test.owner_user_id')::uuid,   'clinic_owner', current_setting('test.clinic_id')::uuid),
  (current_setting('test.doctor_user_id')::uuid,  'staff',        current_setting('test.clinic_id')::uuid),
  (current_setting('test.patient_user_id')::uuid, 'patient',      current_setting('test.clinic_id')::uuid),
  (current_setting('test.outsider_user_id')::uuid,'clinic_owner', current_setting('test.outsider_clinic_id')::uuid);

INSERT INTO public.clinic_staff (id, clinic_id, user_id, role, is_active)
VALUES
  (
    current_setting('test.staff_doctor_id')::uuid,
    current_setting('test.clinic_id')::uuid,
    current_setting('test.doctor_user_id')::uuid,
    'doctor',
    true
  ),
  (
    current_setting('test.staff_owner_id')::uuid,
    current_setting('test.clinic_id')::uuid,
    current_setting('test.owner_user_id')::uuid,
    'doctor',
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
)
VALUES (
  current_setting('test.patient_id')::uuid,
  current_setting('test.patient_user_id')::uuid,
  'Verify P.',
  public.encrypt_patient_pii('Verify Patient'),
  public.encrypt_patient_pii('+212600000099'),
  public.encrypt_patient_pii('verify.patient@example.com'),
  public.hash_phone_number('+212600000099'),
  'app',
  true,
  false,
  current_setting('test.owner_user_id')::uuid,
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
VALUES (
  current_setting('test.appointment_id')::uuid,
  current_setting('test.clinic_id')::uuid,
  current_setting('test.patient_id')::uuid,
  current_setting('test.staff_doctor_id')::uuid,
  CURRENT_DATE,
  'consultation',
  'in_progress',
  true,
  1,
  'Follow-up headache',
  'Patient improving',
  20
);

INSERT INTO public.medical_record_access_grants (
  id,
  patient_id,
  grantee_user_id,
  clinic_id,
  appointment_id,
  status,
  granted_at,
  expires_at,
  duration_seconds,
  scope,
  consent_method,
  consent_recorded_at
)
VALUES (
  current_setting('test.grant_id')::uuid,
  current_setting('test.patient_id')::uuid,
  current_setting('test.doctor_user_id')::uuid,
  current_setting('test.clinic_id')::uuid,
  current_setting('test.appointment_id')::uuid,
  'active',
  NOW() - INTERVAL '5 minutes',
  NOW() + INTERVAL '55 minutes',
  3600,
  '{"type":"full_history"}'::jsonb,
  'in_app_confirm',
  NOW() - INTERVAL '5 minutes'
);

INSERT INTO public.medical_record_diagnoses (
  id,
  appointment_id,
  patient_id,
  clinic_id,
  diagnosed_by,
  diagnosis_code,
  diagnosis_label,
  diagnosis_notes,
  is_patient_visible
)
VALUES (
  current_setting('test.diag_id')::uuid,
  current_setting('test.appointment_id')::uuid,
  current_setting('test.patient_id')::uuid,
  current_setting('test.clinic_id')::uuid,
  current_setting('test.doctor_user_id')::uuid,
  'R51',
  'Headache',
  'Stable',
  true
);

INSERT INTO public.medical_record_prescriptions (
  id,
  appointment_id,
  patient_id,
  clinic_id,
  prescribed_by,
  medication_name,
  dosage,
  route,
  frequency,
  duration_days,
  instructions,
  is_patient_visible
)
VALUES (
  current_setting('test.rx_id')::uuid,
  current_setting('test.appointment_id')::uuid,
  current_setting('test.patient_id')::uuid,
  current_setting('test.clinic_id')::uuid,
  current_setting('test.doctor_user_id')::uuid,
  'Paracetamol',
  '500mg',
  'oral',
  'bid',
  3,
  'After food',
  true
);

INSERT INTO public.medical_record_lab_results (
  id,
  appointment_id,
  patient_id,
  clinic_id,
  recorded_by,
  test_name,
  result_value,
  unit,
  reference_range,
  interpretation,
  is_patient_visible
)
VALUES (
  current_setting('test.lab_id')::uuid,
  current_setting('test.appointment_id')::uuid,
  current_setting('test.patient_id')::uuid,
  current_setting('test.clinic_id')::uuid,
  current_setting('test.doctor_user_id')::uuid,
  'CRP',
  '5',
  'mg/L',
  '0-10',
  'Normal',
  true
);

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.role', 'authenticated', true);

-- Test 1: Patient can view own grants
SELECT set_config('request.jwt.claim.sub', current_setting('test.patient_user_id'), true);
DO $$
DECLARE v_count int;
BEGIN
  SELECT COUNT(*) INTO v_count
  FROM public.medical_record_access_grants
  WHERE id = current_setting('test.grant_id')::uuid;

  IF v_count <> 1 THEN
    RAISE EXCEPTION 'patient_own_grant_select failed: expected 1, got %', v_count;
  END IF;

  RAISE NOTICE 'PASS patient_own_grant_select';
END;
$$;

-- Test 2: Doctor grantee can view grant
SELECT set_config('request.jwt.claim.sub', current_setting('test.doctor_user_id'), true);
DO $$
DECLARE v_count int;
BEGIN
  SELECT COUNT(*) INTO v_count
  FROM public.medical_record_access_grants
  WHERE id = current_setting('test.grant_id')::uuid;

  IF v_count <> 1 THEN
    RAISE EXCEPTION 'doctor_grantee_select failed: expected 1, got %', v_count;
  END IF;

  RAISE NOTICE 'PASS doctor_grantee_select';
END;
$$;

-- Test 3: Outsider cannot see grant
SELECT set_config('request.jwt.claim.sub', current_setting('test.outsider_user_id'), true);
DO $$
DECLARE v_count int;
BEGIN
  SELECT COUNT(*) INTO v_count
  FROM public.medical_record_access_grants
  WHERE id = current_setting('test.grant_id')::uuid;

  IF v_count <> 0 THEN
    RAISE EXCEPTION 'outsider_grant_block failed: expected 0, got %', v_count;
  END IF;

  RAISE NOTICE 'PASS outsider_grant_block';
END;
$$;

-- Test 4: Direct insert blocked for authenticated role
SELECT set_config('request.jwt.claim.sub', current_setting('test.doctor_user_id'), true);
DO $$
BEGIN
  BEGIN
    INSERT INTO public.medical_record_access_grants (
      patient_id, grantee_user_id, clinic_id, appointment_id, status
    ) VALUES (
      current_setting('test.patient_id')::uuid,
      current_setting('test.doctor_user_id')::uuid,
      current_setting('test.clinic_id')::uuid,
      current_setting('test.appointment_id')::uuid,
      'pending_otp'
    );

    RAISE EXCEPTION 'direct_insert_block failed: insert unexpectedly succeeded';
  EXCEPTION
    WHEN insufficient_privilege THEN
      RAISE NOTICE 'PASS direct_insert_block';
  END;
END;
$$;

-- Test 5: Shared detail RPC returns clinical arrays for active grant
SELECT set_config('request.jwt.claim.sub', current_setting('test.doctor_user_id'), true);
DO $$
DECLARE
  v_detail jsonb;
BEGIN
  SELECT public.get_shared_appointment_detail(
    current_setting('test.grant_id')::uuid,
    current_setting('test.appointment_id')::uuid
  )
  INTO v_detail;

  IF v_detail IS NULL THEN
    RAISE EXCEPTION 'shared_detail failed: null response';
  END IF;

  IF jsonb_array_length(COALESCE(v_detail->'diagnoses', '[]'::jsonb)) <> 1 THEN
    RAISE EXCEPTION 'shared_detail failed: diagnoses length mismatch';
  END IF;

  IF jsonb_array_length(COALESCE(v_detail->'prescriptions', '[]'::jsonb)) <> 1 THEN
    RAISE EXCEPTION 'shared_detail failed: prescriptions length mismatch';
  END IF;

  IF jsonb_array_length(COALESCE(v_detail->'lab_results', '[]'::jsonb)) <> 1 THEN
    RAISE EXCEPTION 'shared_detail failed: lab_results length mismatch';
  END IF;

  RAISE NOTICE 'PASS shared_detail_with_clinical_arrays';
END;
$$;

-- Test 6: Expired grants are unusable at RPC layer
RESET ROLE;
UPDATE public.medical_record_access_grants
SET expires_at = NOW() - INTERVAL '1 second'
WHERE id = current_setting('test.grant_id')::uuid;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SELECT set_config('request.jwt.claim.sub', current_setting('test.doctor_user_id'), true);
DO $$
BEGIN
  BEGIN
    PERFORM public.get_shared_appointment_history(current_setting('test.grant_id')::uuid);
    RAISE EXCEPTION 'expired_grant_rpc_block failed: rpc unexpectedly succeeded';
  EXCEPTION
    WHEN insufficient_privilege THEN
      RAISE NOTICE 'PASS expired_grant_rpc_block';
    WHEN OTHERS THEN
      IF POSITION('Active grant not found or expired' IN SQLERRM) > 0 THEN
        RAISE NOTICE 'PASS expired_grant_rpc_block';
      ELSE
        RAISE;
      END IF;
  END;
END;
$$;

DO $$
BEGIN
  RAISE NOTICE 'All medical sharing RLS/RPC checks passed.';
END;
$$;

ROLLBACK;
