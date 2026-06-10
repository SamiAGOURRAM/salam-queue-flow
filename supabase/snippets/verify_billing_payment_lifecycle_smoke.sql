-- Billing/payment lifecycle smoke verification.
-- Validates:
-- 1) Appointment billing defaults are set on insert (amount from clinic settings + unpaid state).
-- 2) update_appointment_payment_status enforces manage_billing and updates paid state.
-- 3) get_clinic_revenue_kpis returns day/week/month billed/collected rollups.
-- 4) Non-billing staff cannot mutate payment state.
--
-- Usage:
--   Get-Content -Raw "supabase/snippets/verify_billing_payment_lifecycle_smoke.sql" |
--     docker exec -i supabase_db_salam-queue-flow psql -v ON_ERROR_STOP=1 -U postgres -d postgres
--
-- Non-destructive: fixture writes are rolled back.

\set ON_ERROR_STOP on

BEGIN;

DO $$
DECLARE
  v_owner_user UUID := gen_random_uuid();
  v_billing_user UUID := gen_random_uuid();
  v_doctor_user UUID := gen_random_uuid();
  v_patient_user UUID := gen_random_uuid();

  v_clinic_id UUID := gen_random_uuid();
  v_staff_billing UUID := gen_random_uuid();
  v_staff_doctor UUID := gen_random_uuid();
  v_patient_id UUID := gen_random_uuid();

  v_appt_one UUID := gen_random_uuid();
  v_appt_two UUID := gen_random_uuid();

  v_appt_one_amount NUMERIC;
  v_appt_two_amount NUMERIC;
  v_appt_one_status public.appointment_payment_status;

  v_kpis JSONB;
BEGIN
  INSERT INTO auth.users (id)
  VALUES (v_owner_user), (v_billing_user), (v_doctor_user), (v_patient_user)
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
    'Billing Smoke Clinic',
    'General Medicine',
    '100 Revenue Street',
    'Casablanca',
    '+212600001001',
    'slotted',
    true,
    jsonb_build_object(
      'appointment_types', jsonb_build_array(
        jsonb_build_object('name', 'consultation', 'label', 'Consultation', 'duration', 15, 'price', 300)
      ),
      'role_definitions', jsonb_build_array(
        jsonb_build_object(
          'key', 'billing_manager',
          'label', 'Billing Manager',
          'base_role', 'staff',
          'permissions', jsonb_build_object(
            'view_billing', true,
            'manage_billing', true,
            'view_analytics', true,
            'view_queue', true,
            'manage_queue', true,
            'manage_appointments', true,
            'view_patients', true
          )
        )
      )
    )
  );

  INSERT INTO public.user_roles (user_id, role, clinic_id)
  VALUES
    (v_owner_user, 'clinic_owner', v_clinic_id),
    (v_billing_user, 'staff', v_clinic_id),
    (v_doctor_user, 'staff', v_clinic_id);

  INSERT INTO public.clinic_staff (
    id,
    clinic_id,
    user_id,
    role,
    is_active
  ) VALUES
    (
      v_staff_billing,
      v_clinic_id,
      v_billing_user,
      'billing_manager',
      true
    ),
    (
      v_staff_doctor,
      v_clinic_id,
      v_doctor_user,
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
  ) VALUES (
    v_patient_id,
    v_patient_user,
    'Billing Smoke Patient',
    public.encrypt_patient_pii('Billing Smoke Patient'),
    public.encrypt_patient_pii('+212600001002'),
    public.encrypt_patient_pii('billing.patient@example.com'),
    public.hash_phone_number('+212600001002'),
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
    actual_duration,
    actual_end_time,
    day_of_week
  ) VALUES
  (
    v_appt_one,
    v_clinic_id,
    v_patient_id,
    v_staff_doctor,
    CURRENT_DATE,
    'consultation',
    'completed',
    true,
    1,
    'Billing smoke 1',
    14,
    NOW() - INTERVAL '30 minutes',
    EXTRACT(ISODOW FROM CURRENT_DATE)::INT
  ),
  (
    v_appt_two,
    v_clinic_id,
    v_patient_id,
    v_staff_doctor,
    CURRENT_DATE,
    'consultation',
    'completed',
    true,
    2,
    'Billing smoke 2',
    16,
    NOW() - INTERVAL '20 minutes',
    EXTRACT(ISODOW FROM CURRENT_DATE)::INT
  );

  SELECT a.billing_amount, a.payment_status
  INTO v_appt_one_amount, v_appt_one_status
  FROM public.appointments a
  WHERE a.id = v_appt_one;

  SELECT a.billing_amount
  INTO v_appt_two_amount
  FROM public.appointments a
  WHERE a.id = v_appt_two;

  IF v_appt_one_amount <> 300 OR v_appt_two_amount <> 300 THEN
    RAISE EXCEPTION 'Expected default billing_amount=300 for both appointments, got %, %', v_appt_one_amount, v_appt_two_amount;
  END IF;

  IF v_appt_one_status <> 'unpaid'::public.appointment_payment_status THEN
    RAISE EXCEPTION 'Expected default payment_status=unpaid, got %', v_appt_one_status;
  END IF;

  PERFORM set_config('request.jwt.claim.role', 'authenticated', false);
  PERFORM set_config('request.jwt.claim.sub', v_billing_user::text, false);

  PERFORM public.update_appointment_payment_status(
    v_appt_one,
    'paid'::public.appointment_payment_status,
    'cash',
    NULL,
    NULL,
    'MAD'
  );

  IF NOT EXISTS (
    SELECT 1
    FROM public.appointments a
    WHERE a.id = v_appt_one
      AND a.payment_status = 'paid'::public.appointment_payment_status
      AND a.payment_method = 'cash'
      AND a.paid_at IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'Expected first appointment payment state to be paid/cash with paid_at';
  END IF;

  SELECT public.get_clinic_revenue_kpis(v_clinic_id)
  INTO v_kpis;

  IF COALESCE((v_kpis -> 'day' ->> 'billed')::NUMERIC, -1) <> 600
     OR COALESCE((v_kpis -> 'day' ->> 'collected')::NUMERIC, -1) <> 300
     OR COALESCE((v_kpis -> 'day' ->> 'unpaidCount')::INT, -1) <> 1
  THEN
    RAISE EXCEPTION 'Unexpected day KPI payload: %', v_kpis;
  END IF;

  PERFORM set_config('request.jwt.claim.sub', v_doctor_user::text, false);

  BEGIN
    PERFORM public.update_appointment_payment_status(
      v_appt_two,
      'paid'::public.appointment_payment_status,
      'card',
      NULL,
      NULL,
      'MAD'
    );

    RAISE EXCEPTION 'Expected manage_billing permission denial for doctor role';
  EXCEPTION
    WHEN SQLSTATE '42501' THEN
      NULL;
  END;

  RAISE NOTICE 'PASS billing/payment lifecycle smoke';
END
$$;

ROLLBACK;
