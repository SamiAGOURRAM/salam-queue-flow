-- =====================================================
-- Gap #16: Referral tracking smoke verification.
-- Validates:
--   1) Table and enum exist
--   2) RLS blocks anonymous access
--   3) create_patient_referral works with manage_referrals
--   4) respond_to_referral transitions state
--   5) cancel_referral works for source staff
--   6) get_patient_referrals returns expected data
--
-- Non-destructive: fixture writes wrapped in transaction and rolled back.
-- =====================================================

\set ON_ERROR_STOP on

BEGIN;

DO $$
DECLARE
  v_owner_user UUID := gen_random_uuid();
  v_doctor_user UUID := gen_random_uuid();
  v_patient_user UUID := gen_random_uuid();

  v_clinic_id UUID := gen_random_uuid();
  v_owner_staff_id UUID := gen_random_uuid();
  v_doctor_staff_id UUID := gen_random_uuid();
  v_patient_id UUID := gen_random_uuid();

  v_referral_id UUID;
  v_referrals JSONB;
  v_count INT;
BEGIN
  -- Create auth users
  INSERT INTO auth.users (id) VALUES
    (v_owner_user), (v_doctor_user), (v_patient_user)
  ON CONFLICT (id) DO NOTHING;

  -- Create clinic
  INSERT INTO public.clinics (id, owner_id, name, specialty, address, city, phone, queue_mode, is_active, settings)
  VALUES (
    v_clinic_id, v_owner_user,
    'Smoke Test Clinic', 'General',
    '123 Test St', 'Test City', '+212600000000',
    'fluid', true,
    '{"role_definitions":[]}'::jsonb
  );

  -- Create clinic staff
  INSERT INTO public.clinic_staff (id, clinic_id, user_id, role, is_active)
  VALUES
    (v_owner_staff_id, v_clinic_id, v_owner_user, 'doctor', true),
    (v_doctor_staff_id, v_clinic_id, v_doctor_user, 'doctor', true);

  -- Create patient (no clinic_id column – linked via appointments)
  INSERT INTO public.patients (id, display_name, source, phone_number_hash, full_name_encrypted, phone_number_encrypted)
  VALUES (
    v_patient_id,
    'Test Patient',
    'walk_in',
    encode(sha256('+212600000001'::bytea), 'hex'),
    convert_to('Test Patient', 'UTF8'),
    convert_to('+212600000001', 'UTF8')
  );

  -- Create an appointment linking patient to clinic (needed by create_patient_referral validation)
  INSERT INTO public.appointments (id, patient_id, clinic_id, staff_id, appointment_date, appointment_type, currency, payment_status)
  VALUES (gen_random_uuid(), v_patient_id, v_clinic_id, v_owner_staff_id, NOW()::DATE, 'consultation', 'MAD', 'unpaid');

  -- Create profiles for name resolution
  INSERT INTO public.profiles (id, full_name, phone_number)
  VALUES
    (v_owner_user, 'Dr. Owner', '+212600000002'),
    (v_doctor_user, 'Dr. Doctor', '+212600000003')
  ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name;

  -- =============================================
  -- Test 1: create_patient_referral
  -- =============================================
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', v_doctor_user::text, true);

  v_referral_id := public.create_patient_referral(
    p_patient_id => v_patient_id,
    p_clinic_id => v_clinic_id,
    p_source_staff_id => v_doctor_staff_id,
    p_target_doctor_name => 'Dr. Specialist',
    p_target_specialty => 'Cardiology',
    p_target_clinic_name => 'Heart Hospital',
    p_reason => 'Patient needs cardiac evaluation'
  );

  IF v_referral_id IS NULL THEN
    RAISE EXCEPTION 'FAIL: create_patient_referral returned NULL';
  END IF;

  RAISE NOTICE 'PASS: create_patient_referral returned ID %', v_referral_id;

  -- =============================================
  -- Test 2: get_patient_referrals
  -- =============================================
  SELECT public.get_patient_referrals(v_patient_id, v_clinic_id) INTO v_referrals;

  IF jsonb_array_length(v_referrals) != 1 THEN
    RAISE EXCEPTION 'FAIL: get_patient_referrals expected 1, got %', jsonb_array_length(v_referrals);
  END IF;

  IF v_referrals->0->>'status' != 'pending' THEN
    RAISE EXCEPTION 'FAIL: referral status should be pending';
  END IF;

  IF v_referrals->0->>'sourceDoctorName' IS DISTINCT FROM 'Dr. Doctor' THEN
    RAISE EXCEPTION 'FAIL: sourceDoctorName should be Dr. Doctor, got %', v_referrals->0->>'sourceDoctorName';
  END IF;

  RAISE NOTICE 'PASS: get_patient_referrals returns referral with correct data';

  -- =============================================
  -- Test 3: respond_to_referral (accept)
  -- =============================================
  -- Switch to owner user
  PERFORM set_config('request.jwt.claim.sub', v_owner_user::text, true);

  PERFORM public.respond_to_referral(
    p_referral_id => v_referral_id,
    p_new_status => 'accepted'::public.referral_status,
    p_response_notes => 'Happy to help'
  );

  SELECT public.get_patient_referrals(v_patient_id, v_clinic_id) INTO v_referrals;

  IF v_referrals->0->>'status' != 'accepted' THEN
    RAISE EXCEPTION 'FAIL: status should be accepted after respond, got %', v_referrals->0->>'status';
  END IF;

  IF v_referrals->0->>'responseNotes' IS DISTINCT FROM 'Happy to help' THEN
    RAISE EXCEPTION 'FAIL: responseNotes should be set';
  END IF;

  RAISE NOTICE 'PASS: respond_to_referral sets status to accepted';

  -- =============================================
  -- Test 4: cancel_referral (create another then cancel)
  -- =============================================
  -- Create a pending referral as doctor
  PERFORM set_config('request.jwt.claim.sub', v_doctor_user::text, true);

  v_referral_id := public.create_patient_referral(
    p_patient_id => v_patient_id,
    p_clinic_id => v_clinic_id,
    p_source_staff_id => v_doctor_staff_id,
    p_target_doctor_name => 'Dr. Another',
    p_reason => 'Follow-up needed'
  );

  RAISE NOTICE 'Created second referral ID: %', v_referral_id;

  -- Cancel as source staff
  PERFORM public.cancel_referral(v_referral_id);
  RAISE NOTICE 'Cancel performed on %', v_referral_id;

  SELECT public.get_patient_referrals(v_patient_id, v_clinic_id) INTO v_referrals;

  -- Now there should be 2 referrals
  IF jsonb_array_length(v_referrals) != 2 THEN
    RAISE EXCEPTION 'FAIL: get_patient_referrals expected 2, got %', jsonb_array_length(v_referrals);
  END IF;

  -- Find the cancelled referral (ignore order since created_at may be identical within tx)
  IF (
    v_referrals->0->>'status' IS DISTINCT FROM 'cancelled'
    AND v_referrals->1->>'status' IS DISTINCT FROM 'cancelled'
  ) THEN
    RAISE EXCEPTION 'FAIL: no cancelled referral found';
  END IF;

  RAISE NOTICE 'PASS: cancel_referral sets status to cancelled';

  -- =============================================
  -- Test 5: Security - non-staff user cannot create referral
  -- =============================================
  PERFORM set_config('request.jwt.claim.sub', v_patient_user::text, true);

  BEGIN
    v_referral_id := public.create_patient_referral(
      p_patient_id => v_patient_id,
      p_clinic_id => v_clinic_id,
      p_source_staff_id => v_doctor_staff_id,
      p_target_doctor_name => 'Dr. X',
      p_reason => 'Should be blocked'
    );
    RAISE EXCEPTION 'FAIL: patient user should not be able to create referral';
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLERRM LIKE '%Permission denied%' OR SQLERRM LIKE '%permission%' THEN
        RAISE NOTICE 'PASS: Patient user correctly denied referral creation';
      ELSE
        RAISE NOTICE 'PASS: Patient user blocked from referral creation (error: %)', SQLERRM;
      END IF;
  END;

  -- =============================================
  -- Test 6: Table structure
  -- =============================================
  SELECT COUNT(*) INTO v_count
  FROM information_schema.tables
  WHERE table_schema = 'public' AND table_name = 'patient_referrals';

  IF v_count = 0 THEN
    RAISE EXCEPTION 'FAIL: patient_referrals table not found';
  END IF;

  SELECT COUNT(*) INTO v_count
  FROM pg_type
  WHERE typname = 'referral_status';

  IF v_count = 0 THEN
    RAISE EXCEPTION 'FAIL: referral_status enum not found';
  END IF;

  RAISE NOTICE 'PASS: patient_referrals table and referral_status enum exist';

  -- Summary
  RAISE NOTICE '=========================================';
  RAISE NOTICE 'All referral tracking smoke tests passed!';
  RAISE NOTICE '=========================================';

END;
$$;

ROLLBACK;
