-- Comprehensive verification matrix for medical record sharing.
-- Usage:
--   Get-Content "supabase/snippets/verify_medical_sharing_comprehensive.sql" -Raw |
--     docker exec -i supabase_db_salam-queue-flow psql -v ON_ERROR_STOP=1 -U postgres -d postgres
--
-- Non-destructive: all changes are wrapped in a transaction and rolled back.

\set ON_ERROR_STOP on

BEGIN;

-- Test-only key material for OTP HMAC validation.
SELECT set_config('app.settings.medical_otp_hmac_key_v1', 'test-medical-otp-hmac-key-v1', true);

-- Actor identities.
SELECT
  set_config('test.owner_user_id', gen_random_uuid()::text, true),
  set_config('test.doctor_user_id', gen_random_uuid()::text, true),
  set_config('test.backup_doctor_user_id', gen_random_uuid()::text, true),
  set_config('test.outsider_user_id', gen_random_uuid()::text, true),
  set_config('test.patient_rls_user_id', gen_random_uuid()::text, true),
  set_config('test.patient_smoke_user_id', gen_random_uuid()::text, true),
  set_config('test.patient_dual_user_id', gen_random_uuid()::text, true),
  set_config('test.patient_rate_user_id', gen_random_uuid()::text, true),
  set_config('test.patient_kill_user_id', gen_random_uuid()::text, true),
  set_config('test.patient_audit_user_id', gen_random_uuid()::text, true),
  set_config('test.patient_bruteforce_user_id', gen_random_uuid()::text, true);

-- Structural entities.
SELECT
  set_config('test.clinic_id', gen_random_uuid()::text, true),
  set_config('test.outsider_clinic_id', gen_random_uuid()::text, true),
  set_config('test.staff_doctor_id', gen_random_uuid()::text, true),
  set_config('test.staff_owner_id', gen_random_uuid()::text, true),
  set_config('test.staff_backup_doctor_id', gen_random_uuid()::text, true),
  set_config('test.patient_rls_id', gen_random_uuid()::text, true),
  set_config('test.patient_smoke_id', gen_random_uuid()::text, true),
  set_config('test.patient_dual_id', gen_random_uuid()::text, true),
  set_config('test.patient_rate_id', gen_random_uuid()::text, true),
  set_config('test.patient_kill_id', gen_random_uuid()::text, true),
  set_config('test.patient_audit_id', gen_random_uuid()::text, true),
  set_config('test.patient_bruteforce_id', gen_random_uuid()::text, true);

INSERT INTO auth.users (id)
VALUES
  (current_setting('test.owner_user_id')::uuid),
  (current_setting('test.doctor_user_id')::uuid),
  (current_setting('test.backup_doctor_user_id')::uuid),
  (current_setting('test.outsider_user_id')::uuid),
  (current_setting('test.patient_rls_user_id')::uuid),
  (current_setting('test.patient_smoke_user_id')::uuid),
  (current_setting('test.patient_dual_user_id')::uuid),
  (current_setting('test.patient_rate_user_id')::uuid),
  (current_setting('test.patient_kill_user_id')::uuid),
  (current_setting('test.patient_audit_user_id')::uuid),
  (current_setting('test.patient_bruteforce_user_id')::uuid)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.clinics (id, owner_id, name, specialty, address, city, phone, is_active)
VALUES
  (
    current_setting('test.clinic_id')::uuid,
    current_setting('test.owner_user_id')::uuid,
    'Medical Share Verification Clinic',
    'General Medicine',
    '1 Verification Avenue',
    'Rabat',
    '+212600001000',
    true
  ),
  (
    current_setting('test.outsider_clinic_id')::uuid,
    current_setting('test.outsider_user_id')::uuid,
    'Outsider Clinic',
    'General Medicine',
    '2 Verification Avenue',
    'Casablanca',
    '+212600001001',
    true
  );

INSERT INTO public.user_roles (user_id, role, clinic_id)
VALUES
  (current_setting('test.owner_user_id')::uuid, 'clinic_owner', current_setting('test.clinic_id')::uuid),
  (current_setting('test.doctor_user_id')::uuid, 'staff', current_setting('test.clinic_id')::uuid),
  (current_setting('test.backup_doctor_user_id')::uuid, 'staff', current_setting('test.clinic_id')::uuid),
  (current_setting('test.outsider_user_id')::uuid, 'clinic_owner', current_setting('test.outsider_clinic_id')::uuid);

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
  ),
  (
    current_setting('test.staff_backup_doctor_id')::uuid,
    current_setting('test.clinic_id')::uuid,
    current_setting('test.backup_doctor_user_id')::uuid,
    'doctor',
    true
  );

CREATE OR REPLACE FUNCTION pg_temp.insert_patient(
  p_patient_id UUID,
  p_user_id UUID,
  p_display_name TEXT,
  p_phone TEXT,
  p_email TEXT,
  p_source TEXT,
  p_created_by UUID
)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_phone TEXT;
  v_email TEXT;
BEGIN
  v_phone := p_phone || right(replace(p_patient_id::text, '-', ''), 6);
  v_email :=
    split_part(p_email, '@', 1)
    || '+'
    || left(replace(p_patient_id::text, '-', ''), 6)
    || '@'
    || split_part(p_email, '@', 2);

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
    p_patient_id,
    p_user_id,
    p_display_name,
    public.encrypt_patient_pii(p_display_name),
    public.encrypt_patient_pii(v_phone),
    public.encrypt_patient_pii(v_email),
    public.hash_phone_number(v_phone),
    p_source,
    CASE WHEN p_user_id IS NULL THEN false ELSE true END,
    false,
    p_created_by,
    true,
    true
  );
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.insert_appointment(
  p_appointment_id UUID,
  p_clinic_id UUID,
  p_patient_id UUID,
  p_staff_id UUID,
  p_status public.appointment_status,
  p_reason TEXT
)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
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
  ) VALUES (
    p_appointment_id,
    p_clinic_id,
    p_patient_id,
    p_staff_id,
    CURRENT_DATE,
    'consultation',
    p_status,
    true,
    1,
    p_reason,
    'Verification note',
    15
  );
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.insert_pending_grant(
  p_grant_id UUID,
  p_patient_id UUID,
  p_grantee_user_id UUID,
  p_clinic_id UUID,
  p_appointment_id UUID,
  p_scope JSONB DEFAULT '{"type":"full_history"}'::jsonb
)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO public.medical_record_access_grants (
    id,
    patient_id,
    grantee_user_id,
    clinic_id,
    appointment_id,
    status,
    scope
  ) VALUES (
    p_grant_id,
    p_patient_id,
    p_grantee_user_id,
    p_clinic_id,
    p_appointment_id,
    'pending_otp',
    COALESCE(p_scope, '{"type":"full_history"}'::jsonb)
  );
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.insert_active_grant(
  p_grant_id UUID,
  p_patient_id UUID,
  p_grantee_user_id UUID,
  p_clinic_id UUID,
  p_appointment_id UUID,
  p_duration_seconds INT DEFAULT 3600,
  p_consent_method TEXT DEFAULT 'otp_sms',
  p_scope JSONB DEFAULT '{"type":"full_history"}'::jsonb
)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
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
  ) VALUES (
    p_grant_id,
    p_patient_id,
    p_grantee_user_id,
    p_clinic_id,
    p_appointment_id,
    'active',
    NOW() - INTERVAL '1 minute',
    NOW() + make_interval(secs => p_duration_seconds),
    p_duration_seconds,
    COALESCE(p_scope, '{"type":"full_history"}'::jsonb),
    p_consent_method,
    NOW() - INTERVAL '1 minute'
  );
END;
$$;

-- Seed one patient row per test actor.
SELECT pg_temp.insert_patient(
  current_setting('test.patient_rls_id')::uuid,
  current_setting('test.patient_rls_user_id')::uuid,
  'RLS Patient',
  '+212600001101',
  'rls.patient@example.com',
  'app',
  current_setting('test.owner_user_id')::uuid
);

SELECT pg_temp.insert_patient(
  current_setting('test.patient_smoke_id')::uuid,
  current_setting('test.patient_smoke_user_id')::uuid,
  'Smoke Patient',
  '+212600001102',
  'smoke.patient@example.com',
  'app',
  current_setting('test.owner_user_id')::uuid
);

SELECT pg_temp.insert_patient(
  current_setting('test.patient_dual_id')::uuid,
  current_setting('test.patient_dual_user_id')::uuid,
  'Dual Path Patient',
  '+212600001103',
  'dual.patient@example.com',
  'app',
  current_setting('test.owner_user_id')::uuid
);

SELECT pg_temp.insert_patient(
  current_setting('test.patient_rate_id')::uuid,
  current_setting('test.patient_rate_user_id')::uuid,
  'Rate Limit Patient',
  '+212600001104',
  'rate.patient@example.com',
  'app',
  current_setting('test.owner_user_id')::uuid
);

SELECT pg_temp.insert_patient(
  current_setting('test.patient_kill_id')::uuid,
  current_setting('test.patient_kill_user_id')::uuid,
  'Kill Switch Patient',
  '+212600001105',
  'kill.patient@example.com',
  'app',
  current_setting('test.owner_user_id')::uuid
);

SELECT pg_temp.insert_patient(
  current_setting('test.patient_audit_id')::uuid,
  current_setting('test.patient_audit_user_id')::uuid,
  'Audit Patient',
  '+212600001106',
  'audit.patient@example.com',
  'app',
  current_setting('test.owner_user_id')::uuid
);

SELECT pg_temp.insert_patient(
  current_setting('test.patient_bruteforce_id')::uuid,
  current_setting('test.patient_bruteforce_user_id')::uuid,
  'Bruteforce Patient',
  '+212600001107',
  'bruteforce.patient@example.com',
  'app',
  current_setting('test.owner_user_id')::uuid
);

-- -----------------------------------------------------------------------------
-- Test 1: RLS visibility and direct-write blocking under authenticated role.
-- -----------------------------------------------------------------------------

DO $$
DECLARE
  v_appointment_id UUID := gen_random_uuid();
  v_grant_id UUID := gen_random_uuid();
BEGIN
  PERFORM pg_temp.insert_appointment(
    v_appointment_id,
    current_setting('test.clinic_id')::uuid,
    current_setting('test.patient_rls_id')::uuid,
    current_setting('test.staff_doctor_id')::uuid,
    'in_progress',
    'RLS baseline consult'
  );

  PERFORM pg_temp.insert_active_grant(
    v_grant_id,
    current_setting('test.patient_rls_id')::uuid,
    current_setting('test.doctor_user_id')::uuid,
    current_setting('test.clinic_id')::uuid,
    v_appointment_id,
    3600,
    'otp_sms'
  );

  PERFORM set_config('test.rls_appointment_id', v_appointment_id::text, true);
  PERFORM set_config('test.rls_grant_id', v_grant_id::text, true);
END;
$$;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.role', 'authenticated', true);

SELECT set_config('request.jwt.claim.sub', current_setting('test.doctor_user_id'), true);
DO $$
DECLARE
  v_count INT;
BEGIN
  SELECT COUNT(*) INTO v_count
  FROM public.medical_record_access_grants
  WHERE id = current_setting('test.rls_grant_id')::uuid;

  IF v_count <> 1 THEN
    RAISE EXCEPTION 'doctor_grantee_rls_select failed: expected 1, got %', v_count;
  END IF;

  RAISE NOTICE 'PASS doctor_grantee_rls_select';
END;
$$;

SELECT set_config('request.jwt.claim.sub', current_setting('test.outsider_user_id'), true);
DO $$
DECLARE
  v_count INT;
BEGIN
  SELECT COUNT(*) INTO v_count
  FROM public.medical_record_access_grants
  WHERE id = current_setting('test.rls_grant_id')::uuid;

  IF v_count <> 0 THEN
    RAISE EXCEPTION 'outsider_rls_block failed: expected 0, got %', v_count;
  END IF;

  RAISE NOTICE 'PASS outsider_rls_block';
END;
$$;

SELECT set_config('request.jwt.claim.sub', current_setting('test.doctor_user_id'), true);
DO $$
BEGIN
  BEGIN
    INSERT INTO public.medical_record_access_grants (
      patient_id,
      grantee_user_id,
      clinic_id,
      appointment_id,
      status,
      scope
    ) VALUES (
      current_setting('test.patient_rls_id')::uuid,
      current_setting('test.doctor_user_id')::uuid,
      current_setting('test.clinic_id')::uuid,
      current_setting('test.rls_appointment_id')::uuid,
      'pending_otp',
      '{"type":"full_history"}'::jsonb
    );

    RAISE EXCEPTION 'direct_insert_block failed: insert unexpectedly succeeded';
  EXCEPTION
    WHEN insufficient_privilege THEN
      RAISE NOTICE 'PASS direct_insert_block';
  END;
END;
$$;

SELECT set_config('request.jwt.claim.sub', current_setting('test.doctor_user_id'), true);
DO $$
DECLARE
  v_diag_visible_id UUID := gen_random_uuid();
  v_diag_hidden_id UUID := gen_random_uuid();
  v_rx_visible_id UUID := gen_random_uuid();
  v_rx_hidden_id UUID := gen_random_uuid();
  v_lab_visible_id UUID := gen_random_uuid();
  v_lab_hidden_id UUID := gen_random_uuid();
BEGIN
  INSERT INTO public.medical_record_diagnoses (
    id, appointment_id, patient_id, clinic_id, diagnosed_by, diagnosis_code, diagnosis_label, diagnosis_notes, is_patient_visible
  ) VALUES (
    v_diag_visible_id,
    current_setting('test.rls_appointment_id')::uuid,
    current_setting('test.patient_rls_id')::uuid,
    current_setting('test.clinic_id')::uuid,
    current_setting('test.doctor_user_id')::uuid,
    'A01',
    'Visible diagnosis',
    'Visible diagnosis note',
    true
  );

  INSERT INTO public.medical_record_diagnoses (
    id, appointment_id, patient_id, clinic_id, diagnosed_by, diagnosis_code, diagnosis_label, diagnosis_notes, is_patient_visible
  ) VALUES (
    v_diag_hidden_id,
    current_setting('test.rls_appointment_id')::uuid,
    current_setting('test.patient_rls_id')::uuid,
    current_setting('test.clinic_id')::uuid,
    current_setting('test.doctor_user_id')::uuid,
    'B01',
    'Hidden diagnosis',
    'Hidden diagnosis note',
    false
  );

  INSERT INTO public.medical_record_prescriptions (
    id, appointment_id, patient_id, clinic_id, prescribed_by, medication_name, dosage, route, frequency, duration_days, instructions, is_patient_visible
  ) VALUES (
    v_rx_visible_id,
    current_setting('test.rls_appointment_id')::uuid,
    current_setting('test.patient_rls_id')::uuid,
    current_setting('test.clinic_id')::uuid,
    current_setting('test.doctor_user_id')::uuid,
    'Visible Rx',
    '5mg',
    'oral',
    'qd',
    5,
    'Visible instructions',
    true
  );

  INSERT INTO public.medical_record_prescriptions (
    id, appointment_id, patient_id, clinic_id, prescribed_by, medication_name, dosage, route, frequency, duration_days, instructions, is_patient_visible
  ) VALUES (
    v_rx_hidden_id,
    current_setting('test.rls_appointment_id')::uuid,
    current_setting('test.patient_rls_id')::uuid,
    current_setting('test.clinic_id')::uuid,
    current_setting('test.doctor_user_id')::uuid,
    'Hidden Rx',
    '10mg',
    'oral',
    'bid',
    7,
    'Hidden instructions',
    false
  );

  INSERT INTO public.medical_record_lab_results (
    id, appointment_id, patient_id, clinic_id, recorded_by, test_name, result_value, unit, reference_range, interpretation, is_patient_visible
  ) VALUES (
    v_lab_visible_id,
    current_setting('test.rls_appointment_id')::uuid,
    current_setting('test.patient_rls_id')::uuid,
    current_setting('test.clinic_id')::uuid,
    current_setting('test.doctor_user_id')::uuid,
    'Visible Lab',
    '1.0',
    'u',
    '0-2',
    'Visible lab interpretation',
    true
  );

  INSERT INTO public.medical_record_lab_results (
    id, appointment_id, patient_id, clinic_id, recorded_by, test_name, result_value, unit, reference_range, interpretation, is_patient_visible
  ) VALUES (
    v_lab_hidden_id,
    current_setting('test.rls_appointment_id')::uuid,
    current_setting('test.patient_rls_id')::uuid,
    current_setting('test.clinic_id')::uuid,
    current_setting('test.doctor_user_id')::uuid,
    'Hidden Lab',
    '9.0',
    'u',
    '0-2',
    'Hidden lab interpretation',
    false
  );

  PERFORM set_config('test.rls_diag_visible_id', v_diag_visible_id::text, true);
  PERFORM set_config('test.rls_diag_hidden_id', v_diag_hidden_id::text, true);
  PERFORM set_config('test.rls_rx_visible_id', v_rx_visible_id::text, true);
  PERFORM set_config('test.rls_rx_hidden_id', v_rx_hidden_id::text, true);
  PERFORM set_config('test.rls_lab_visible_id', v_lab_visible_id::text, true);
  PERFORM set_config('test.rls_lab_hidden_id', v_lab_hidden_id::text, true);

  RAISE NOTICE 'PASS staff_clinical_insert_via_rls';
END;
$$;

SELECT set_config('request.jwt.claim.sub', current_setting('test.outsider_user_id'), true);
DO $$
BEGIN
  BEGIN
    INSERT INTO public.medical_record_diagnoses (
      id, appointment_id, patient_id, clinic_id, diagnosed_by, diagnosis_code, diagnosis_label, diagnosis_notes, is_patient_visible
    ) VALUES (
      gen_random_uuid(),
      current_setting('test.rls_appointment_id')::uuid,
      current_setting('test.patient_rls_id')::uuid,
      current_setting('test.clinic_id')::uuid,
      current_setting('test.outsider_user_id')::uuid,
      'X01',
      'Unauthorized diagnosis',
      'should fail',
      true
    );

    RAISE EXCEPTION 'outsider_clinical_insert_block failed: insert unexpectedly succeeded';
  EXCEPTION
    WHEN insufficient_privilege THEN
      RAISE NOTICE 'PASS outsider_clinical_insert_block';
    WHEN OTHERS THEN
      IF POSITION('row-level security' IN lower(SQLERRM)) > 0 THEN
        RAISE NOTICE 'PASS outsider_clinical_insert_block';
      ELSE
        RAISE;
      END IF;
  END;
END;
$$;

SELECT set_config('request.jwt.claim.sub', current_setting('test.patient_rls_user_id'), true);
DO $$
DECLARE
  v_diag_count INT;
  v_rx_count INT;
  v_lab_count INT;
BEGIN
  SELECT COUNT(*) INTO v_diag_count
  FROM public.medical_record_diagnoses d
  WHERE d.id IN (
    current_setting('test.rls_diag_visible_id')::uuid,
    current_setting('test.rls_diag_hidden_id')::uuid
  );

  SELECT COUNT(*) INTO v_rx_count
  FROM public.medical_record_prescriptions p
  WHERE p.id IN (
    current_setting('test.rls_rx_visible_id')::uuid,
    current_setting('test.rls_rx_hidden_id')::uuid
  );

  SELECT COUNT(*) INTO v_lab_count
  FROM public.medical_record_lab_results l
  WHERE l.id IN (
    current_setting('test.rls_lab_visible_id')::uuid,
    current_setting('test.rls_lab_hidden_id')::uuid
  );

  IF v_diag_count <> 1 OR v_rx_count <> 1 OR v_lab_count <> 1 THEN
    RAISE EXCEPTION 'patient_visible_clinical_select failed: expected 1 visible record per table, got diagnoses=%, prescriptions=%, labs=%',
      v_diag_count, v_rx_count, v_lab_count;
  END IF;

  RAISE NOTICE 'PASS patient_visible_clinical_select';
END;
$$;

RESET ROLE;

DO $$
DECLARE
  v_appointment_id UUID := gen_random_uuid();
  v_pending_one UUID := gen_random_uuid();
  v_pending_two UUID := gen_random_uuid();
BEGIN
  PERFORM pg_temp.insert_appointment(
    v_appointment_id,
    current_setting('test.clinic_id')::uuid,
    current_setting('test.patient_audit_id')::uuid,
    current_setting('test.staff_doctor_id')::uuid,
    'in_progress',
    'Open grant uniqueness scenario'
  );

  PERFORM pg_temp.insert_pending_grant(
    v_pending_one,
    current_setting('test.patient_audit_id')::uuid,
    current_setting('test.doctor_user_id')::uuid,
    current_setting('test.clinic_id')::uuid,
    v_appointment_id
  );

  BEGIN
    PERFORM pg_temp.insert_pending_grant(
      v_pending_two,
      current_setting('test.patient_audit_id')::uuid,
      current_setting('test.doctor_user_id')::uuid,
      current_setting('test.clinic_id')::uuid,
      v_appointment_id
    );

    RAISE EXCEPTION 'open_grant_unique_constraint failed: second pending grant unexpectedly succeeded';
  EXCEPTION
    WHEN unique_violation THEN
      RAISE NOTICE 'PASS open_grant_unique_constraint';
  END;

  UPDATE public.medical_record_access_grants
  SET status = 'expired',
      updated_at = NOW()
  WHERE id = v_pending_one;
END;
$$;

-- -----------------------------------------------------------------------------
-- Test 2: OTP end-to-end smoke (request -> claim -> finalize -> validate -> read -> revoke).
-- -----------------------------------------------------------------------------

DO $$
DECLARE
  v_patient_id UUID := current_setting('test.patient_smoke_id')::uuid;
  v_clinic_id UUID := current_setting('test.clinic_id')::uuid;
  v_doctor_user_id UUID := current_setting('test.doctor_user_id')::uuid;
  v_appointment_id UUID := gen_random_uuid();
  v_request JSONB;
  v_claim JSONB;
  v_finalize JSONB;
  v_validate JSONB;
  v_history JSONB;
  v_revoke JSONB;
  v_access JSONB;
  v_grant_id UUID;
BEGIN
  PERFORM pg_temp.insert_appointment(
    v_appointment_id,
    v_clinic_id,
    v_patient_id,
    current_setting('test.staff_doctor_id')::uuid,
    'in_progress',
    'OTP smoke scenario'
  );

  INSERT INTO public.medical_record_diagnoses (
    id, appointment_id, patient_id, clinic_id, diagnosed_by, diagnosis_code, diagnosis_label, diagnosis_notes, is_patient_visible
  ) VALUES (
    gen_random_uuid(), v_appointment_id, v_patient_id, v_clinic_id, v_doctor_user_id, 'R51', 'Headache', 'Improving', true
  );

  INSERT INTO public.medical_record_prescriptions (
    id, appointment_id, patient_id, clinic_id, prescribed_by, medication_name, dosage, route, frequency, duration_days, instructions, is_patient_visible
  ) VALUES (
    gen_random_uuid(), v_appointment_id, v_patient_id, v_clinic_id, v_doctor_user_id, 'Paracetamol', '500mg', 'oral', 'bid', 3, 'After meals', true
  );

  INSERT INTO public.medical_record_lab_results (
    id, appointment_id, patient_id, clinic_id, recorded_by, test_name, result_value, unit, reference_range, interpretation, is_patient_visible
  ) VALUES (
    gen_random_uuid(), v_appointment_id, v_patient_id, v_clinic_id, v_doctor_user_id, 'CRP', '5', 'mg/L', '0-10', 'Normal', true
  );

  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  PERFORM set_config('request.jwt.claim.sub', v_doctor_user_id::text, true);

  SELECT public.request_medical_record_access(v_patient_id, v_appointment_id, v_clinic_id, NULL)
  INTO v_request;

  v_grant_id := (v_request->>'grant_id')::uuid;
  IF v_grant_id IS NULL THEN
    RAISE EXCEPTION 'otp_smoke failed: request did not return grant_id: %', v_request;
  END IF;

  PERFORM set_config('request.jwt.claim.role', 'service_role', true);
  PERFORM set_config('request.jwt.claim.sub', '', true);

  SELECT public.claim_medical_record_otp_for_delivery(v_grant_id, v_doctor_user_id)
  INTO v_claim;

  IF COALESCE(v_claim->>'otp_id', '') = '' OR COALESCE(v_claim->>'otp_plaintext', '') = '' THEN
    RAISE EXCEPTION 'otp_smoke failed: claim payload incomplete: %', v_claim;
  END IF;

  SELECT public.finalize_medical_record_otp_delivery((v_claim->>'otp_id')::uuid, true, NULL)
  INTO v_finalize;

  IF COALESCE(v_finalize->>'status', '') <> 'sent' THEN
    RAISE EXCEPTION 'otp_smoke failed: finalize not sent: %', v_finalize;
  END IF;

  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  PERFORM set_config('request.jwt.claim.sub', v_doctor_user_id::text, true);

  SELECT public.validate_medical_record_otp(v_grant_id, v_claim->>'otp_plaintext', 3600)
  INTO v_validate;

  IF COALESCE((v_validate->>'success')::boolean, false) IS NOT TRUE THEN
    RAISE EXCEPTION 'otp_smoke failed: validate did not succeed: %', v_validate;
  END IF;

  SELECT public.get_shared_appointment_history(v_grant_id)
  INTO v_history;

  IF COALESCE(jsonb_typeof(v_history), '') <> 'array' OR jsonb_array_length(v_history) < 1 THEN
    RAISE EXCEPTION 'otp_smoke failed: expected non-empty history array: %', v_history;
  END IF;

  PERFORM set_config('request.jwt.claim.sub', current_setting('test.patient_smoke_user_id'), true);
  SELECT public.revoke_medical_record_access(v_grant_id)
  INTO v_revoke;

  IF COALESCE((v_revoke->>'success')::boolean, false) IS NOT TRUE THEN
    RAISE EXCEPTION 'otp_smoke failed: patient revoke failed: %', v_revoke;
  END IF;

  PERFORM set_config('request.jwt.claim.sub', v_doctor_user_id::text, true);
  SELECT public.check_active_grant_for_patient(v_patient_id)
  INTO v_access;

  IF COALESCE((v_access->>'has_access')::boolean, false) THEN
    RAISE EXCEPTION 'otp_smoke failed: grant still reported active after revoke: %', v_access;
  END IF;

  BEGIN
    PERFORM public.get_shared_appointment_history(v_grant_id);
    RAISE EXCEPTION 'otp_smoke failed: revoked grant history unexpectedly succeeded';
  EXCEPTION
    WHEN insufficient_privilege THEN
      NULL;
    WHEN OTHERS THEN
      IF POSITION('Active grant not found or expired' IN SQLERRM) = 0 THEN
        RAISE;
      END IF;
  END;

  RAISE NOTICE 'PASS otp_smoke_end_to_end';
END;
$$;

-- -----------------------------------------------------------------------------
-- Test 3: In-app dual-path approval grants access without OTP.
-- -----------------------------------------------------------------------------

DO $$
DECLARE
  v_patient_id UUID := current_setting('test.patient_dual_id')::uuid;
  v_clinic_id UUID := current_setting('test.clinic_id')::uuid;
  v_doctor_user_id UUID := current_setting('test.doctor_user_id')::uuid;
  v_appointment_id UUID := gen_random_uuid();
  v_request JSONB;
  v_approve JSONB;
  v_history JSONB;
  v_grant_id UUID;
  v_consent_method TEXT;
BEGIN
  PERFORM pg_temp.insert_appointment(
    v_appointment_id,
    v_clinic_id,
    v_patient_id,
    current_setting('test.staff_doctor_id')::uuid,
    'in_progress',
    'In-app approval scenario'
  );

  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  PERFORM set_config('request.jwt.claim.sub', v_doctor_user_id::text, true);

  SELECT public.request_medical_record_access(v_patient_id, v_appointment_id, v_clinic_id, NULL)
  INTO v_request;

  v_grant_id := (v_request->>'grant_id')::uuid;
  IF v_grant_id IS NULL THEN
    RAISE EXCEPTION 'dual_path failed: request did not return grant_id: %', v_request;
  END IF;

  PERFORM set_config('request.jwt.claim.sub', current_setting('test.patient_dual_user_id'), true);
  SELECT public.approve_medical_record_access(v_grant_id, 7200)
  INTO v_approve;

  IF COALESCE((v_approve->>'success')::boolean, false) IS NOT TRUE THEN
    RAISE EXCEPTION 'dual_path failed: approve did not succeed: %', v_approve;
  END IF;

  SELECT g.consent_method INTO v_consent_method
  FROM public.medical_record_access_grants g
  WHERE g.id = v_grant_id;

  IF v_consent_method <> 'in_app_confirm' THEN
    RAISE EXCEPTION 'dual_path failed: expected in_app_confirm, got %', v_consent_method;
  END IF;

  PERFORM set_config('request.jwt.claim.sub', v_doctor_user_id::text, true);
  SELECT public.get_shared_appointment_history(v_grant_id)
  INTO v_history;

  IF COALESCE(jsonb_typeof(v_history), '') <> 'array' OR jsonb_array_length(v_history) < 1 THEN
    RAISE EXCEPTION 'dual_path failed: expected non-empty history array: %', v_history;
  END IF;

  RAISE NOTICE 'PASS dual_path_in_app_approval';
END;
$$;

-- -----------------------------------------------------------------------------
-- Test 4: Rate limiting (4th OTP claim in 15 min is blocked).
-- -----------------------------------------------------------------------------

DO $$
DECLARE
  v_patient_id UUID := current_setting('test.patient_rate_id')::uuid;
  v_clinic_id UUID := current_setting('test.clinic_id')::uuid;
  v_backup_doctor_user_id UUID := current_setting('test.backup_doctor_user_id')::uuid;
  v_appointment_id UUID := gen_random_uuid();
  v_grant_id UUID := gen_random_uuid();
  v_claim JSONB;
  v_finalize JSONB;
  v_i INT;
  v_otp_count INT;
BEGIN
  PERFORM pg_temp.insert_appointment(
    v_appointment_id,
    v_clinic_id,
    v_patient_id,
    current_setting('test.staff_backup_doctor_id')::uuid,
    'in_progress',
    'Rate limit scenario'
  );

  PERFORM pg_temp.insert_pending_grant(
    v_grant_id,
    v_patient_id,
    v_backup_doctor_user_id,
    v_clinic_id,
    v_appointment_id
  );

  FOR v_i IN 1..4 LOOP
    PERFORM set_config('request.jwt.claim.role', 'service_role', true);
    PERFORM set_config('request.jwt.claim.sub', '', true);

    IF v_i < 4 THEN
      SELECT public.claim_medical_record_otp_for_delivery(v_grant_id, v_backup_doctor_user_id)
      INTO v_claim;

      IF COALESCE(v_claim->>'otp_id', '') = '' THEN
        RAISE EXCEPTION 'rate_limit failed: expected otp_id on claim %: %', v_i, v_claim;
      END IF;

      SELECT public.finalize_medical_record_otp_delivery((v_claim->>'otp_id')::uuid, false, 'rate-limit-test')
      INTO v_finalize;

      IF COALESCE(v_finalize->>'status', '') <> 'failed' THEN
        RAISE EXCEPTION 'rate_limit failed: expected failed finalize on claim %, got %', v_i, v_finalize;
      END IF;
    ELSE
      BEGIN
        PERFORM public.claim_medical_record_otp_for_delivery(v_grant_id, v_backup_doctor_user_id);
        RAISE EXCEPTION 'rate_limit failed: 4th claim unexpectedly succeeded';
      EXCEPTION
        WHEN OTHERS THEN
          IF POSITION('Rate limit exceeded' IN SQLERRM) = 0 THEN
            RAISE;
          END IF;
      END;
    END IF;
  END LOOP;

  SELECT COUNT(*) INTO v_otp_count
  FROM public.medical_record_otp_codes o
  WHERE o.requesting_user_id = v_backup_doctor_user_id
    AND o.patient_id = v_patient_id;

  IF v_otp_count <> 3 THEN
    RAISE EXCEPTION 'rate_limit failed: expected exactly 3 OTP rows, got %', v_otp_count;
  END IF;

  RAISE NOTICE 'PASS otp_rate_limit_enforcement';
END;
$$;

-- -----------------------------------------------------------------------------
-- Test 5: Brute-force lockout after max wrong attempts.
-- -----------------------------------------------------------------------------

DO $$
DECLARE
  v_patient_id UUID := current_setting('test.patient_bruteforce_id')::uuid;
  v_clinic_id UUID := current_setting('test.clinic_id')::uuid;
  v_doctor_user_id UUID := current_setting('test.doctor_user_id')::uuid;
  v_appointment_id UUID := gen_random_uuid();
  v_grant_id UUID := gen_random_uuid();
  v_claim JSONB;
  v_finalize JSONB;
  v_result JSONB;
  v_wrong_code TEXT;
  v_i INT;
BEGIN
  PERFORM pg_temp.insert_appointment(
    v_appointment_id,
    v_clinic_id,
    v_patient_id,
    current_setting('test.staff_doctor_id')::uuid,
    'in_progress',
    'Brute force scenario'
  );

  PERFORM pg_temp.insert_pending_grant(
    v_grant_id,
    v_patient_id,
    v_doctor_user_id,
    v_clinic_id,
    v_appointment_id
  );

  PERFORM set_config('request.jwt.claim.role', 'service_role', true);
  PERFORM set_config('request.jwt.claim.sub', '', true);

  SELECT public.claim_medical_record_otp_for_delivery(v_grant_id, v_doctor_user_id)
  INTO v_claim;

  SELECT public.finalize_medical_record_otp_delivery((v_claim->>'otp_id')::uuid, true, NULL)
  INTO v_finalize;

  IF COALESCE(v_finalize->>'status', '') <> 'sent' THEN
    RAISE EXCEPTION 'bruteforce failed: finalize not sent: %', v_finalize;
  END IF;

  v_wrong_code := lpad((((v_claim->>'otp_plaintext')::int + 1) % 1000000)::text, 6, '0');

  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  PERFORM set_config('request.jwt.claim.sub', v_doctor_user_id::text, true);

  FOR v_i IN 1..4 LOOP
    SELECT public.validate_medical_record_otp(v_grant_id, v_wrong_code, 3600)
    INTO v_result;

    IF COALESCE(v_result->>'error', '') <> 'invalid_code' THEN
      RAISE EXCEPTION 'bruteforce failed: attempt % expected invalid_code, got %', v_i, v_result;
    END IF;
  END LOOP;

  SELECT public.validate_medical_record_otp(v_grant_id, v_wrong_code, 3600)
  INTO v_result;

  IF COALESCE(v_result->>'error', '') <> 'locked' THEN
    RAISE EXCEPTION 'bruteforce failed: expected locked on max attempt, got %', v_result;
  END IF;

  SELECT public.validate_medical_record_otp(v_grant_id, v_claim->>'otp_plaintext', 3600)
  INTO v_result;

  IF COALESCE(v_result->>'error', '') <> 'locked' THEN
    RAISE EXCEPTION 'bruteforce failed: expected locked even with correct OTP, got %', v_result;
  END IF;

  RAISE NOTICE 'PASS otp_bruteforce_lockout';
END;
$$;

-- -----------------------------------------------------------------------------
-- Test 6: Delivery replay/idempotency guard rails.
-- -----------------------------------------------------------------------------

DO $$
DECLARE
  v_patient_id UUID := current_setting('test.patient_smoke_id')::uuid;
  v_clinic_id UUID := current_setting('test.clinic_id')::uuid;
  v_doctor_user_id UUID := current_setting('test.doctor_user_id')::uuid;
  v_appointment_id UUID := gen_random_uuid();
  v_grant_id UUID := gen_random_uuid();
  v_claim JSONB;
  v_otp_count INT;
BEGIN
  PERFORM pg_temp.insert_appointment(
    v_appointment_id,
    v_clinic_id,
    v_patient_id,
    current_setting('test.staff_doctor_id')::uuid,
    'in_progress',
    'Replay protection scenario'
  );

  PERFORM pg_temp.insert_pending_grant(
    v_grant_id,
    v_patient_id,
    v_doctor_user_id,
    v_clinic_id,
    v_appointment_id
  );

  PERFORM set_config('request.jwt.claim.role', 'service_role', true);
  PERFORM set_config('request.jwt.claim.sub', '', true);

  SELECT public.claim_medical_record_otp_for_delivery(v_grant_id, v_doctor_user_id)
  INTO v_claim;

  IF COALESCE(v_claim->>'otp_id', '') = '' THEN
    RAISE EXCEPTION 'replay failed: first claim missing otp_id: %', v_claim;
  END IF;

  BEGIN
    PERFORM public.claim_medical_record_otp_for_delivery(v_grant_id, v_doctor_user_id);
    RAISE EXCEPTION 'replay failed: duplicate in-progress claim unexpectedly succeeded';
  EXCEPTION
    WHEN OTHERS THEN
      IF POSITION('Delivery already in progress' IN SQLERRM) = 0 THEN
        RAISE;
      END IF;
  END;

  PERFORM public.finalize_medical_record_otp_delivery((v_claim->>'otp_id')::uuid, true, NULL);

  BEGIN
    PERFORM public.claim_medical_record_otp_for_delivery(v_grant_id, v_doctor_user_id);
    RAISE EXCEPTION 'replay failed: resend during cooldown unexpectedly succeeded';
  EXCEPTION
    WHEN OTHERS THEN
      IF POSITION('OTP resend cooldown active' IN SQLERRM) = 0 THEN
        RAISE;
      END IF;
  END;

  SELECT COUNT(*) INTO v_otp_count
  FROM public.medical_record_otp_codes o
  WHERE o.grant_id = v_grant_id;

  IF v_otp_count <> 1 THEN
    RAISE EXCEPTION 'replay failed: expected exactly 1 OTP row, got %', v_otp_count;
  END IF;

  UPDATE public.medical_record_access_grants
  SET status = 'expired',
      updated_at = NOW()
  WHERE id = v_grant_id;

  RAISE NOTICE 'PASS otp_delivery_replay_idempotency';
END;
$$;

-- -----------------------------------------------------------------------------
-- Test 7: Simulated concurrent OTP validation (single-use semantics).
-- -----------------------------------------------------------------------------

DO $$
DECLARE
  v_patient_id UUID := current_setting('test.patient_smoke_id')::uuid;
  v_clinic_id UUID := current_setting('test.clinic_id')::uuid;
  v_doctor_user_id UUID := current_setting('test.doctor_user_id')::uuid;
  v_appointment_id UUID := gen_random_uuid();
  v_grant_id UUID := gen_random_uuid();
  v_claim JSONB;
  v_first_validate JSONB;
  v_second_validate JSONB;
BEGIN
  PERFORM pg_temp.insert_appointment(
    v_appointment_id,
    v_clinic_id,
    v_patient_id,
    current_setting('test.staff_doctor_id')::uuid,
    'in_progress',
    'Concurrent validation scenario'
  );

  PERFORM pg_temp.insert_pending_grant(
    v_grant_id,
    v_patient_id,
    v_doctor_user_id,
    v_clinic_id,
    v_appointment_id
  );

  PERFORM set_config('request.jwt.claim.role', 'service_role', true);
  PERFORM set_config('request.jwt.claim.sub', '', true);

  SELECT public.claim_medical_record_otp_for_delivery(v_grant_id, v_doctor_user_id)
  INTO v_claim;

  PERFORM public.finalize_medical_record_otp_delivery((v_claim->>'otp_id')::uuid, true, NULL);

  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  PERFORM set_config('request.jwt.claim.sub', v_doctor_user_id::text, true);

  SELECT public.validate_medical_record_otp(v_grant_id, v_claim->>'otp_plaintext', 3600)
  INTO v_first_validate;

  IF COALESCE((v_first_validate->>'success')::boolean, false) IS NOT TRUE THEN
    RAISE EXCEPTION 'concurrent_validate failed: first validate did not succeed: %', v_first_validate;
  END IF;

  SELECT public.validate_medical_record_otp(v_grant_id, v_claim->>'otp_plaintext', 3600)
  INTO v_second_validate;

  IF COALESCE(v_second_validate->>'error', '') <> 'already_active' THEN
    RAISE EXCEPTION 'concurrent_validate failed: second validate expected already_active, got %', v_second_validate;
  END IF;

  RAISE NOTICE 'PASS otp_single_use_validate';
END;
$$;

-- -----------------------------------------------------------------------------
-- Test 8: Expiry sweep function transitions stale active/pending grants.
-- -----------------------------------------------------------------------------

DO $$
DECLARE
  v_patient_id UUID := current_setting('test.patient_audit_id')::uuid;
  v_clinic_id UUID := current_setting('test.clinic_id')::uuid;
  v_doctor_user_id UUID := current_setting('test.doctor_user_id')::uuid;
  v_backup_doctor_user_id UUID := current_setting('test.backup_doctor_user_id')::uuid;
  v_active_appointment_id UUID := gen_random_uuid();
  v_pending_appointment_id UUID := gen_random_uuid();
  v_active_grant_id UUID := gen_random_uuid();
  v_pending_grant_id UUID := gen_random_uuid();
  v_expire_result JSONB;
  v_status_active TEXT;
  v_status_pending TEXT;
  v_access JSONB;
BEGIN
  PERFORM pg_temp.insert_appointment(
    v_active_appointment_id,
    v_clinic_id,
    v_patient_id,
    current_setting('test.staff_doctor_id')::uuid,
    'completed',
    'Expired active grant scenario'
  );

  PERFORM pg_temp.insert_appointment(
    v_pending_appointment_id,
    v_clinic_id,
    v_patient_id,
    current_setting('test.staff_doctor_id')::uuid,
    'in_progress',
    'Expired pending grant scenario'
  );

  PERFORM pg_temp.insert_active_grant(
    v_active_grant_id,
    v_patient_id,
    v_doctor_user_id,
    v_clinic_id,
    v_active_appointment_id,
    3600,
    'otp_sms'
  );

  UPDATE public.medical_record_access_grants
  SET expires_at = NOW() - INTERVAL '5 minutes'
  WHERE id = v_active_grant_id;

  PERFORM pg_temp.insert_pending_grant(
    v_pending_grant_id,
    v_patient_id,
    v_backup_doctor_user_id,
    v_clinic_id,
    v_pending_appointment_id
  );

  UPDATE public.medical_record_access_grants
  SET created_at = NOW() - INTERVAL '40 minutes'
  WHERE id = v_pending_grant_id;

  PERFORM set_config('request.jwt.claim.role', 'service_role', true);
  PERFORM set_config('request.jwt.claim.sub', '', true);

  SELECT public.expire_stale_medical_record_grants()
  INTO v_expire_result;

  IF COALESCE((v_expire_result->>'expired_active')::INT, 0) < 1 THEN
    RAISE EXCEPTION 'expiry_sweep failed: expected expired_active >= 1, got %', v_expire_result;
  END IF;

  IF COALESCE((v_expire_result->>'expired_pending')::INT, 0) < 1 THEN
    RAISE EXCEPTION 'expiry_sweep failed: expected expired_pending >= 1, got %', v_expire_result;
  END IF;

  SELECT status INTO v_status_active
  FROM public.medical_record_access_grants
  WHERE id = v_active_grant_id;

  SELECT status INTO v_status_pending
  FROM public.medical_record_access_grants
  WHERE id = v_pending_grant_id;

  IF v_status_active <> 'expired' OR v_status_pending <> 'expired' THEN
    RAISE EXCEPTION 'expiry_sweep failed: expected expired statuses, got active=%, pending=%', v_status_active, v_status_pending;
  END IF;

  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  PERFORM set_config('request.jwt.claim.sub', v_doctor_user_id::text, true);

  SELECT public.check_active_grant_for_patient(v_patient_id)
  INTO v_access;

  IF COALESCE((v_access->>'has_access')::boolean, false) THEN
    RAISE EXCEPTION 'expiry_sweep failed: expired grant still reported as active: %', v_access;
  END IF;

  RAISE NOTICE 'PASS expire_stale_grants';
END;
$$;

-- -----------------------------------------------------------------------------
-- Test 9: Global kill switch revokes all active/pending shares.
-- -----------------------------------------------------------------------------

DO $$
DECLARE
  v_patient_id UUID := current_setting('test.patient_kill_id')::uuid;
  v_clinic_id UUID := current_setting('test.clinic_id')::uuid;
  v_doctor_user_id UUID := current_setting('test.doctor_user_id')::uuid;
  v_backup_doctor_user_id UUID := current_setting('test.backup_doctor_user_id')::uuid;
  v_owner_user_id UUID := current_setting('test.owner_user_id')::uuid;
  v_appt_one UUID := gen_random_uuid();
  v_appt_two UUID := gen_random_uuid();
  v_appt_three UUID := gen_random_uuid();
  v_grant_one UUID := gen_random_uuid();
  v_grant_two UUID := gen_random_uuid();
  v_grant_three UUID := gen_random_uuid();
  v_result JSONB;
  v_revoked_count INT;
BEGIN
  PERFORM pg_temp.insert_appointment(
    v_appt_one,
    v_clinic_id,
    v_patient_id,
    current_setting('test.staff_doctor_id')::uuid,
    'in_progress',
    'Kill switch active grant'
  );

  PERFORM pg_temp.insert_appointment(
    v_appt_two,
    v_clinic_id,
    v_patient_id,
    current_setting('test.staff_doctor_id')::uuid,
    'in_progress',
    'Kill switch pending grant one'
  );

  PERFORM pg_temp.insert_appointment(
    v_appt_three,
    v_clinic_id,
    v_patient_id,
    current_setting('test.staff_backup_doctor_id')::uuid,
    'completed',
    'Kill switch pending grant two'
  );

  PERFORM pg_temp.insert_active_grant(
    v_grant_one,
    v_patient_id,
    v_doctor_user_id,
    v_clinic_id,
    v_appt_one,
    3600,
    'otp_sms'
  );

  PERFORM pg_temp.insert_pending_grant(
    v_grant_two,
    v_patient_id,
    v_backup_doctor_user_id,
    v_clinic_id,
    v_appt_two
  );

  PERFORM pg_temp.insert_pending_grant(
    v_grant_three,
    v_patient_id,
    v_owner_user_id,
    v_clinic_id,
    v_appt_three
  );

  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  PERFORM set_config('request.jwt.claim.sub', current_setting('test.patient_kill_user_id'), true);

  SELECT public.revoke_all_medical_record_access()
  INTO v_result;

  IF COALESCE((v_result->>'success')::boolean, false) IS NOT TRUE THEN
    RAISE EXCEPTION 'kill_switch failed: revoke_all did not succeed: %', v_result;
  END IF;

  IF COALESCE((v_result->>'revoked_count')::INT, 0) <> 3 THEN
    RAISE EXCEPTION 'kill_switch failed: expected revoked_count=3, got %', v_result;
  END IF;

  SELECT COUNT(*) INTO v_revoked_count
  FROM public.medical_record_access_grants g
  WHERE g.id IN (v_grant_one, v_grant_two, v_grant_three)
    AND g.status = 'revoked'
    AND g.revocation_reason = 'kill_switch';

  IF v_revoked_count <> 3 THEN
    RAISE EXCEPTION 'kill_switch failed: expected 3 revoked kill_switch grants, got %', v_revoked_count;
  END IF;

  RAISE NOTICE 'PASS patient_kill_switch_revoke_all';
END;
$$;

-- -----------------------------------------------------------------------------
-- Test 10: Walk-in revocation requires authenticated clinic staff.
-- -----------------------------------------------------------------------------

DO $$
DECLARE
  v_clinic_id UUID := current_setting('test.clinic_id')::uuid;
  v_doctor_user_id UUID := current_setting('test.doctor_user_id')::uuid;
  v_walkin_patient_id UUID := gen_random_uuid();
  v_appointment_id UUID := gen_random_uuid();
  v_grant_id UUID := gen_random_uuid();
  v_result JSONB;
  v_status TEXT;
  v_reason TEXT;
BEGIN
  PERFORM pg_temp.insert_patient(
    v_walkin_patient_id,
    NULL,
    'Walk-in Patient',
    '+212600001108',
    'walkin.patient@example.com',
    'walk_in',
    current_setting('test.owner_user_id')::uuid
  );

  PERFORM pg_temp.insert_appointment(
    v_appointment_id,
    v_clinic_id,
    v_walkin_patient_id,
    current_setting('test.staff_doctor_id')::uuid,
    'in_progress',
    'Walk-in revoke scenario'
  );

  PERFORM pg_temp.insert_active_grant(
    v_grant_id,
    v_walkin_patient_id,
    v_doctor_user_id,
    v_clinic_id,
    v_appointment_id,
    1800,
    'otp_sms'
  );

  PERFORM set_config('request.jwt.claim.role', 'anon', true);
  PERFORM set_config('request.jwt.claim.sub', '', true);

  BEGIN
    PERFORM public.revoke_walkin_access_with_token(v_grant_id, 'STOP-123');
    RAISE EXCEPTION 'walkin_revoke failed: unauthenticated revoke unexpectedly succeeded';
  EXCEPTION
    WHEN insufficient_privilege THEN
      NULL;
    WHEN OTHERS THEN
      IF POSITION('Authentication required' IN SQLERRM) = 0 THEN
        RAISE;
      END IF;
  END;

  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  PERFORM set_config('request.jwt.claim.sub', v_doctor_user_id::text, true);

  SELECT public.revoke_walkin_access_with_token(v_grant_id, 'STOP-123')
  INTO v_result;

  IF COALESCE((v_result->>'success')::boolean, false) IS NOT TRUE THEN
    RAISE EXCEPTION 'walkin_revoke failed: staff revoke did not succeed: %', v_result;
  END IF;

  SELECT g.status, g.revocation_reason INTO v_status, v_reason
  FROM public.medical_record_access_grants g
  WHERE g.id = v_grant_id;

  IF v_status <> 'revoked' OR v_reason <> 'walkin_stop' THEN
    RAISE EXCEPTION 'walkin_revoke failed: expected revoked/walkin_stop, got %/%', v_status, v_reason;
  END IF;

  RAISE NOTICE 'PASS walkin_revoke_with_token';
END;
$$;

-- -----------------------------------------------------------------------------
-- Test 11: Clinical visibility filtering + patient audit pagination.
-- -----------------------------------------------------------------------------

DO $$
DECLARE
  v_patient_id UUID := current_setting('test.patient_audit_id')::uuid;
  v_clinic_id UUID := current_setting('test.clinic_id')::uuid;
  v_doctor_user_id UUID := current_setting('test.doctor_user_id')::uuid;
  v_appointment_id UUID := gen_random_uuid();
  v_grant_id UUID := gen_random_uuid();
  v_history JSONB;
  v_detail JSONB;
  v_log_page_one JSONB;
  v_log_page_two JSONB;
BEGIN
  PERFORM pg_temp.insert_appointment(
    v_appointment_id,
    v_clinic_id,
    v_patient_id,
    current_setting('test.staff_doctor_id')::uuid,
    'completed',
    'Audit visibility scenario'
  );

  PERFORM pg_temp.insert_active_grant(
    v_grant_id,
    v_patient_id,
    v_doctor_user_id,
    v_clinic_id,
    v_appointment_id,
    7200,
    'in_app_confirm'
  );

  INSERT INTO public.medical_record_diagnoses (
    id, appointment_id, patient_id, clinic_id, diagnosed_by, diagnosis_code, diagnosis_label, diagnosis_notes, is_patient_visible
  ) VALUES
    (gen_random_uuid(), v_appointment_id, v_patient_id, v_clinic_id, v_doctor_user_id, 'I10', 'Hypertension', 'Visible diagnosis', true),
    (gen_random_uuid(), v_appointment_id, v_patient_id, v_clinic_id, v_doctor_user_id, 'F32', 'Sensitive diagnosis', 'Hidden diagnosis', false);

  INSERT INTO public.medical_record_prescriptions (
    id, appointment_id, patient_id, clinic_id, prescribed_by, medication_name, dosage, route, frequency, duration_days, instructions, is_patient_visible
  ) VALUES
    (gen_random_uuid(), v_appointment_id, v_patient_id, v_clinic_id, v_doctor_user_id, 'Amlodipine', '5mg', 'oral', 'qd', 30, 'Visible Rx', true),
    (gen_random_uuid(), v_appointment_id, v_patient_id, v_clinic_id, v_doctor_user_id, 'Confidential Med', '10mg', 'oral', 'bid', 7, 'Hidden Rx', false);

  INSERT INTO public.medical_record_lab_results (
    id, appointment_id, patient_id, clinic_id, recorded_by, test_name, result_value, unit, reference_range, interpretation, is_patient_visible
  ) VALUES
    (gen_random_uuid(), v_appointment_id, v_patient_id, v_clinic_id, v_doctor_user_id, 'HbA1c', '5.6', '%', '4.0-5.6', 'Visible lab', true),
    (gen_random_uuid(), v_appointment_id, v_patient_id, v_clinic_id, v_doctor_user_id, 'Hidden Marker', '1.2', 'u', '0-1', 'Hidden lab', false);

  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  PERFORM set_config('request.jwt.claim.sub', v_doctor_user_id::text, true);

  SELECT public.get_shared_appointment_history(v_grant_id)
  INTO v_history;

  IF COALESCE(jsonb_typeof(v_history), '') <> 'array' OR jsonb_array_length(v_history) < 1 THEN
    RAISE EXCEPTION 'audit_visibility failed: history should be non-empty array: %', v_history;
  END IF;

  SELECT public.get_shared_appointment_detail(v_grant_id, v_appointment_id)
  INTO v_detail;

  IF jsonb_array_length(COALESCE(v_detail->'diagnoses', '[]'::jsonb)) <> 1 THEN
    RAISE EXCEPTION 'audit_visibility failed: diagnoses visibility mismatch: %', v_detail;
  END IF;

  IF jsonb_array_length(COALESCE(v_detail->'prescriptions', '[]'::jsonb)) <> 1 THEN
    RAISE EXCEPTION 'audit_visibility failed: prescriptions visibility mismatch: %', v_detail;
  END IF;

  IF jsonb_array_length(COALESCE(v_detail->'lab_results', '[]'::jsonb)) <> 1 THEN
    RAISE EXCEPTION 'audit_visibility failed: lab_results visibility mismatch: %', v_detail;
  END IF;

  PERFORM set_config('request.jwt.claim.sub', current_setting('test.patient_audit_user_id'), true);

  SELECT public.get_my_medical_record_access_log(1, 0)
  INTO v_log_page_one;

  SELECT public.get_my_medical_record_access_log(1, 1)
  INTO v_log_page_two;

  IF COALESCE(jsonb_typeof(v_log_page_one), '') <> 'array' OR jsonb_array_length(v_log_page_one) <> 1 THEN
    RAISE EXCEPTION 'audit_visibility failed: expected first audit page length 1, got %', v_log_page_one;
  END IF;

  IF COALESCE(jsonb_typeof(v_log_page_two), '') <> 'array' OR jsonb_array_length(v_log_page_two) <> 1 THEN
    RAISE EXCEPTION 'audit_visibility failed: expected second audit page length 1, got %', v_log_page_two;
  END IF;

  RAISE NOTICE 'PASS clinical_visibility_and_audit_pagination';
END;
$$;

DO $$
BEGIN
  RAISE NOTICE 'PASS baseline comprehensive medical sharing checks';
END;
$$;

-- -----------------------------------------------------------------------------
-- Test 12: Scope normalization defaults + patient image policy coverage.
-- -----------------------------------------------------------------------------

DO $$
DECLARE
  v_clinic_id UUID := current_setting('test.clinic_id')::uuid;
  v_doctor_user_id UUID := current_setting('test.doctor_user_id')::uuid;
  v_backup_doctor_user_id UUID := current_setting('test.backup_doctor_user_id')::uuid;
  v_scope_patient_user_id UUID := gen_random_uuid();
  v_patient_id UUID := gen_random_uuid();
  v_appointment_scope_default UUID := gen_random_uuid();
  v_appointment_scope_full UUID := gen_random_uuid();
  v_request_default JSONB;
  v_request_full JSONB;
  v_grant_default UUID;
  v_grant_full UUID;
  v_scope_default JSONB;
  v_scope_full JSONB;
  v_report_visible UUID := gen_random_uuid();
  v_report_hidden UUID := gen_random_uuid();
  v_image_visible UUID := gen_random_uuid();
  v_image_hidden UUID := gen_random_uuid();
  v_storage_visible TEXT;
  v_storage_hidden TEXT;
  v_patient_visible_meta_count INT;
  v_patient_visible_object_count INT;
  v_other_patient_meta_count INT;
  v_other_patient_object_count INT;
BEGIN
  INSERT INTO auth.users (id) VALUES (v_scope_patient_user_id)
  ON CONFLICT (id) DO NOTHING;

  PERFORM pg_temp.insert_patient(
    v_patient_id,
    v_scope_patient_user_id,
    'Scope Policy Patient',
    '+212600001109',
    'scope.patient@example.com',
    'app',
    current_setting('test.owner_user_id')::uuid
  );

  PERFORM pg_temp.insert_appointment(
    v_appointment_scope_default,
    v_clinic_id,
    v_patient_id,
    current_setting('test.staff_doctor_id')::uuid,
    'in_progress',
    'Scope fallback appointment'
  );

  PERFORM pg_temp.insert_appointment(
    v_appointment_scope_full,
    v_clinic_id,
    v_patient_id,
    current_setting('test.staff_backup_doctor_id')::uuid,
    'in_progress',
    'Scope full-history appointment'
  );

  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  PERFORM set_config('request.jwt.claim.sub', v_doctor_user_id::text, true);

  SELECT public.request_medical_record_access(
    v_patient_id,
    v_appointment_scope_default,
    v_clinic_id,
    NULL,
    NULL
  )
  INTO v_request_default;

  v_grant_default := (v_request_default->>'grant_id')::uuid;
  IF v_grant_default IS NULL THEN
    RAISE EXCEPTION 'scope_policy failed: default-scope request did not return grant_id: %', v_request_default;
  END IF;

  SELECT g.scope INTO v_scope_default
  FROM public.medical_record_access_grants g
  WHERE g.id = v_grant_default;

  IF COALESCE(v_scope_default->>'type', '') <> 'specific_appointments' THEN
    RAISE EXCEPTION 'scope_policy failed: expected specific_appointments fallback, got %', v_scope_default;
  END IF;

  IF COALESCE(jsonb_array_length(v_scope_default->'appointment_ids'), 0) <> 1
     OR COALESCE(v_scope_default->'appointment_ids'->>0, '') <> v_appointment_scope_default::text THEN
    RAISE EXCEPTION 'scope_policy failed: fallback appointment_ids mismatch: %', v_scope_default;
  END IF;

  PERFORM set_config('request.jwt.claim.sub', v_backup_doctor_user_id::text, true);

  SELECT public.request_medical_record_access(
    v_patient_id,
    v_appointment_scope_full,
    v_clinic_id,
    NULL,
    '{"type":"full_history"}'::jsonb
  )
  INTO v_request_full;

  v_grant_full := (v_request_full->>'grant_id')::uuid;
  IF v_grant_full IS NULL THEN
    RAISE EXCEPTION 'scope_policy failed: full-history request did not return grant_id: %', v_request_full;
  END IF;

  SELECT g.scope INTO v_scope_full
  FROM public.medical_record_access_grants g
  WHERE g.id = v_grant_full;

  IF COALESCE(v_scope_full->>'type', '') <> 'full_history' THEN
    RAISE EXCEPTION 'scope_policy failed: expected full_history, got %', v_scope_full;
  END IF;

  INSERT INTO public.medical_procedure_reports (
    id,
    appointment_id,
    patient_id,
    clinic_id,
    authored_by,
    title,
    content,
    content_plain_text,
    is_patient_visible,
    status
  ) VALUES
    (
      v_report_visible,
      v_appointment_scope_default,
      v_patient_id,
      v_clinic_id,
      v_doctor_user_id,
      'Visible report',
      '{"type":"doc","content":[{"type":"paragraph"}]}'::jsonb,
      'Visible report text',
      true,
      'finalized'
    ),
    (
      v_report_hidden,
      v_appointment_scope_default,
      v_patient_id,
      v_clinic_id,
      v_doctor_user_id,
      'Hidden report',
      '{"type":"doc","content":[{"type":"paragraph"}]}'::jsonb,
      'Hidden report text',
      false,
      'finalized'
    );

  v_storage_visible := format('%s/%s/%s', v_clinic_id::text, v_report_visible::text, 'visible.jpg');
  v_storage_hidden := format('%s/%s/%s', v_clinic_id::text, v_report_hidden::text, 'hidden.jpg');

  INSERT INTO public.medical_report_images (
    id,
    report_id,
    uploaded_by,
    clinic_id,
    storage_path,
    file_name,
    file_size,
    mime_type
  ) VALUES
    (
      v_image_visible,
      v_report_visible,
      v_doctor_user_id,
      v_clinic_id,
      v_storage_visible,
      'visible.jpg',
      100,
      'image/jpeg'
    ),
    (
      v_image_hidden,
      v_report_hidden,
      v_doctor_user_id,
      v_clinic_id,
      v_storage_hidden,
      'hidden.jpg',
      100,
      'image/jpeg'
    );

  INSERT INTO storage.objects (
    bucket_id,
    name,
    owner,
    owner_id,
    metadata,
    user_metadata,
    version
  ) VALUES
    (
      'medical-report-images',
      v_storage_visible,
      v_doctor_user_id,
      v_doctor_user_id::text,
      '{}'::jsonb,
      '{}'::jsonb,
      '1'
    ),
    (
      'medical-report-images',
      v_storage_hidden,
      v_doctor_user_id,
      v_doctor_user_id::text,
      '{}'::jsonb,
      '{}'::jsonb,
      '1'
    );

  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);

  PERFORM set_config('request.jwt.claim.sub', v_scope_patient_user_id::text, true);

  SELECT COUNT(*) INTO v_patient_visible_meta_count
  FROM public.medical_report_images i
  WHERE i.id IN (v_image_visible, v_image_hidden);

  SELECT COUNT(*) INTO v_patient_visible_object_count
  FROM storage.objects o
  WHERE o.bucket_id = 'medical-report-images'
    AND o.name IN (v_storage_visible, v_storage_hidden);

  IF v_patient_visible_meta_count <> 1 OR v_patient_visible_object_count <> 1 THEN
    RAISE EXCEPTION 'scope_policy failed: patient image policy visibility mismatch meta=% object=%',
      v_patient_visible_meta_count,
      v_patient_visible_object_count;
  END IF;

  PERFORM set_config('request.jwt.claim.sub', current_setting('test.patient_audit_user_id'), true);

  SELECT COUNT(*) INTO v_other_patient_meta_count
  FROM public.medical_report_images i
  WHERE i.id IN (v_image_visible, v_image_hidden);

  SELECT COUNT(*) INTO v_other_patient_object_count
  FROM storage.objects o
  WHERE o.bucket_id = 'medical-report-images'
    AND o.name IN (v_storage_visible, v_storage_hidden);

  IF v_other_patient_meta_count <> 0 OR v_other_patient_object_count <> 0 THEN
    RAISE EXCEPTION 'scope_policy failed: non-owner patient unexpectedly saw image rows meta=% object=%',
      v_other_patient_meta_count,
      v_other_patient_object_count;
  END IF;

  EXECUTE 'RESET ROLE';

  RAISE NOTICE 'PASS scope_normalization_and_image_policy_coverage';
END;
$$;

DO $$
BEGIN
  RAISE NOTICE 'All comprehensive medical sharing checks passed.';
END;
$$;

ROLLBACK;
