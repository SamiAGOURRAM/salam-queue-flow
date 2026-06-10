-- Patient medical passport core smoke verification.
-- Validates:
-- 1) get_patient_medical_passport enforces view permissions.
-- 2) Clinician roles with manage_medical_records can insert/update problem + medication entries.
-- 3) View-only roles can read but cannot mutate.
-- 4) Patient owners can read/write their own entries and are denied access to other patients.
--
-- Usage:
--   Get-Content -Raw "supabase/snippets/verify_patient_medical_passport_core_smoke.sql" |
--     docker exec -i supabase_db_salam-queue-flow psql -v ON_ERROR_STOP=1 -U postgres -d postgres
--
-- Non-destructive: fixture writes are wrapped in a transaction and rolled back.

\set ON_ERROR_STOP on

BEGIN;

DO $$
DECLARE
  v_owner_user UUID := gen_random_uuid();
  v_doctor_user UUID := gen_random_uuid();
  v_viewer_user UUID := gen_random_uuid();
  v_restricted_user UUID := gen_random_uuid();
  v_patient_user UUID := gen_random_uuid();
  v_other_patient_user UUID := gen_random_uuid();

  v_clinic_id UUID := gen_random_uuid();
  v_doctor_staff_id UUID := gen_random_uuid();
  v_viewer_staff_id UUID := gen_random_uuid();
  v_restricted_staff_id UUID := gen_random_uuid();

  v_patient_id UUID := gen_random_uuid();
  v_other_patient_id UUID := gen_random_uuid();
  v_appointment_id UUID := gen_random_uuid();
BEGIN
  PERFORM set_config('test.passport_owner_user_id', v_owner_user::TEXT, true);
  PERFORM set_config('test.passport_doctor_user_id', v_doctor_user::TEXT, true);
  PERFORM set_config('test.passport_viewer_user_id', v_viewer_user::TEXT, true);
  PERFORM set_config('test.passport_restricted_user_id', v_restricted_user::TEXT, true);
  PERFORM set_config('test.passport_patient_user_id', v_patient_user::TEXT, true);
  PERFORM set_config('test.passport_other_patient_user_id', v_other_patient_user::TEXT, true);

  PERFORM set_config('test.passport_clinic_id', v_clinic_id::TEXT, true);
  PERFORM set_config('test.passport_doctor_staff_id', v_doctor_staff_id::TEXT, true);
  PERFORM set_config('test.passport_viewer_staff_id', v_viewer_staff_id::TEXT, true);
  PERFORM set_config('test.passport_restricted_staff_id', v_restricted_staff_id::TEXT, true);

  PERFORM set_config('test.passport_patient_id', v_patient_id::TEXT, true);
  PERFORM set_config('test.passport_other_patient_id', v_other_patient_id::TEXT, true);
  PERFORM set_config('test.passport_appointment_id', v_appointment_id::TEXT, true);

  INSERT INTO auth.users (id)
  VALUES
    (v_owner_user),
    (v_doctor_user),
    (v_viewer_user),
    (v_restricted_user),
    (v_patient_user),
    (v_other_patient_user)
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.clinics (
    id,
    owner_id,
    name,
    specialty,
    address,
    city,
    phone,
    queue_mode,
    is_active,
    settings
  ) VALUES (
    v_clinic_id,
    v_owner_user,
    'Medical Passport Smoke Clinic',
    'General Medicine',
    '400 Passport Avenue',
    'Casablanca',
    '+212600004001',
    'slotted',
    true,
    jsonb_build_object(
      'role_definitions', jsonb_build_array(
        jsonb_build_object(
          'key', 'doctor',
          'label', 'Doctor',
          'base_role', 'doctor',
          'permissions', jsonb_build_object(
            'view_medical_records', true,
            'manage_medical_records', true,
            'manage_queue', true,
            'manage_appointments', true
          )
        ),
        jsonb_build_object(
          'key', 'medical_viewer',
          'label', 'Medical Viewer',
          'base_role', 'staff',
          'permissions', jsonb_build_object(
            'view_medical_records', true,
            'manage_medical_records', false,
            'manage_queue', false,
            'manage_appointments', false
          )
        ),
        jsonb_build_object(
          'key', 'restricted_staff',
          'label', 'Restricted Staff',
          'base_role', 'staff',
          'permissions', jsonb_build_object(
            'view_medical_records', false,
            'manage_medical_records', false,
            'manage_queue', false,
            'manage_appointments', false
          )
        )
      )
    )
  );

  INSERT INTO public.user_roles (user_id, role, clinic_id)
  VALUES
    (v_owner_user, 'clinic_owner', v_clinic_id),
    (v_doctor_user, 'staff', v_clinic_id),
    (v_viewer_user, 'staff', v_clinic_id),
    (v_restricted_user, 'staff', v_clinic_id);

  INSERT INTO public.clinic_staff (id, clinic_id, user_id, role, is_active)
  VALUES
    (v_doctor_staff_id, v_clinic_id, v_doctor_user, 'doctor', true),
    (v_viewer_staff_id, v_clinic_id, v_viewer_user, 'medical_viewer', true),
    (v_restricted_staff_id, v_clinic_id, v_restricted_user, 'restricted_staff', true);

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
  ) VALUES
  (
    v_patient_id,
    v_patient_user,
    'Passport Owner',
    public.encrypt_patient_pii('Passport Owner'),
    public.encrypt_patient_pii('+212600004002'),
    public.encrypt_patient_pii('passport.owner@example.com'),
    public.hash_phone_number('+212600004002'),
    'app',
    true,
    false,
    v_owner_user,
    true,
    true
  ),
  (
    v_other_patient_id,
    v_other_patient_user,
    'Different Patient',
    public.encrypt_patient_pii('Different Patient'),
    public.encrypt_patient_pii('+212600004003'),
    public.encrypt_patient_pii('different.patient@example.com'),
    public.hash_phone_number('+212600004003'),
    'app',
    true,
    false,
    v_owner_user,
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
    day_of_week
  ) VALUES (
    v_appointment_id,
    v_clinic_id,
    v_patient_id,
    v_doctor_staff_id,
    CURRENT_DATE,
    'consultation',
    'in_progress',
    true,
    1,
    'Medical passport verification',
    EXTRACT(ISODOW FROM CURRENT_DATE)::INT
  );
END
$$;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.role', 'authenticated', true);

SELECT set_config('request.jwt.claim.sub', current_setting('test.passport_restricted_user_id'), true);
DO $$
BEGIN
  BEGIN
    PERFORM public.get_patient_medical_passport(current_setting('test.passport_patient_id')::UUID);
    RAISE EXCEPTION 'Expected passport read denial for restricted staff';
  EXCEPTION
    WHEN SQLSTATE '42501' THEN
      RAISE NOTICE 'PASS restricted_read_denied';
  END;
END;
$$;

SELECT set_config('request.jwt.claim.sub', current_setting('test.passport_viewer_user_id'), true);
DO $$
DECLARE
  v_passport JSONB;
BEGIN
  SELECT public.get_patient_medical_passport(current_setting('test.passport_patient_id')::UUID)
  INTO v_passport;

  IF COALESCE((v_passport -> 'counts' ->> 'allergies')::INT, -1) < 0 THEN
    RAISE EXCEPTION 'Expected passport payload counts for viewer, got %', v_passport;
  END IF;

  RAISE NOTICE 'PASS viewer_read_allowed';
END;
$$;

SELECT set_config('request.jwt.claim.sub', current_setting('test.passport_viewer_user_id'), true);
DO $$
BEGIN
  BEGIN
    INSERT INTO public.patient_problem_list (
      patient_id,
      clinic_id,
      problem_name,
      source,
      recorded_by
    ) VALUES (
      current_setting('test.passport_patient_id')::UUID,
      current_setting('test.passport_clinic_id')::UUID,
      'Viewer should not write',
      'clinician',
      current_setting('test.passport_viewer_user_id')::UUID
    );

    RAISE EXCEPTION 'Expected viewer write denial for patient_problem_list';
  EXCEPTION
    WHEN SQLSTATE '42501' THEN
      RAISE NOTICE 'PASS viewer_write_denied';
  END;
END;
$$;

SELECT set_config('request.jwt.claim.sub', current_setting('test.passport_doctor_user_id'), true);
DO $$
DECLARE
  v_problem_id UUID;
  v_medication_id UUID;
  v_passport JSONB;
BEGIN
  INSERT INTO public.patient_problem_list (
    patient_id,
    clinic_id,
    problem_name,
    icd10_code,
    notes,
    source,
    recorded_by
  ) VALUES (
    current_setting('test.passport_patient_id')::UUID,
    current_setting('test.passport_clinic_id')::UUID,
    'Type 2 Diabetes Mellitus',
    'E11.9',
    'Monitor HbA1c trend',
    'clinician',
    current_setting('test.passport_doctor_user_id')::UUID
  ) RETURNING id INTO v_problem_id;

  INSERT INTO public.patient_current_medications (
    patient_id,
    clinic_id,
    medication_name,
    dosage,
    route,
    frequency,
    instructions,
    source,
    recorded_by
  ) VALUES (
    current_setting('test.passport_patient_id')::UUID,
    current_setting('test.passport_clinic_id')::UUID,
    'Metformin',
    '500 mg',
    'oral',
    'BID',
    'Take with meals',
    'clinician',
    current_setting('test.passport_doctor_user_id')::UUID
  ) RETURNING id INTO v_medication_id;

  SELECT public.get_patient_medical_passport(current_setting('test.passport_patient_id')::UUID)
  INTO v_passport;

  IF COALESCE((v_passport -> 'counts' ->> 'activeProblems')::INT, 0) < 1 THEN
    RAISE EXCEPTION 'Expected active problem count after clinician insert, got %', v_passport;
  END IF;

  IF COALESCE((v_passport -> 'counts' ->> 'currentMedications')::INT, 0) < 1 THEN
    RAISE EXCEPTION 'Expected current medication count after clinician insert, got %', v_passport;
  END IF;

  UPDATE public.patient_problem_list
  SET
    is_active = false,
    resolved_at = NOW(),
    resolved_by = current_setting('test.passport_doctor_user_id')::UUID,
    resolution_notes = 'Condition controlled'
  WHERE id = v_problem_id;

  UPDATE public.patient_current_medications
  SET
    is_active = false,
    stopped_at = NOW(),
    stopped_by = current_setting('test.passport_doctor_user_id')::UUID,
    stop_reason = 'Temporary stop for labs'
  WHERE id = v_medication_id;

  SELECT public.get_patient_medical_passport(current_setting('test.passport_patient_id')::UUID)
  INTO v_passport;

  IF COALESCE((v_passport -> 'counts' ->> 'activeProblems')::INT, -1) <> 0 THEN
    RAISE EXCEPTION 'Expected no active problems after resolution, got %', v_passport;
  END IF;

  IF COALESCE((v_passport -> 'counts' ->> 'currentMedications')::INT, -1) <> 0 THEN
    RAISE EXCEPTION 'Expected no active medications after stop, got %', v_passport;
  END IF;

  RAISE NOTICE 'PASS doctor_write_and_resolve';
END;
$$;

SELECT set_config('request.jwt.claim.sub', current_setting('test.passport_patient_user_id'), true);
DO $$
DECLARE
  v_passport JSONB;
BEGIN
  INSERT INTO public.patient_problem_list (
    patient_id,
    clinic_id,
    problem_name,
    notes,
    source,
    recorded_by
  ) VALUES (
    current_setting('test.passport_patient_id')::UUID,
    NULL,
    'Seasonal Allergic Rhinitis',
    'Worse during spring',
    'patient',
    current_setting('test.passport_patient_user_id')::UUID
  );

  INSERT INTO public.patient_current_medications (
    patient_id,
    clinic_id,
    medication_name,
    dosage,
    frequency,
    source,
    recorded_by
  ) VALUES (
    current_setting('test.passport_patient_id')::UUID,
    NULL,
    'Cetirizine',
    '10 mg',
    'daily',
    'patient',
    current_setting('test.passport_patient_user_id')::UUID
  );

  SELECT public.get_patient_medical_passport(current_setting('test.passport_patient_id')::UUID)
  INTO v_passport;

  IF COALESCE((v_passport -> 'counts' ->> 'activeProblems')::INT, 0) < 1 THEN
    RAISE EXCEPTION 'Expected patient-owned problem to appear in passport, got %', v_passport;
  END IF;

  IF COALESCE((v_passport -> 'counts' ->> 'currentMedications')::INT, 0) < 1 THEN
    RAISE EXCEPTION 'Expected patient-owned medication to appear in passport, got %', v_passport;
  END IF;

  BEGIN
    PERFORM public.get_patient_medical_passport(current_setting('test.passport_other_patient_id')::UUID);
    RAISE EXCEPTION 'Expected patient owner to be denied for a different patient record';
  EXCEPTION
    WHEN SQLSTATE '42501' THEN
      NULL;
  END;

  RAISE NOTICE 'PASS patient_owner_scope';
END;
$$;

RESET ROLE;

ROLLBACK;
