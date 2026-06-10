-- Analytics + billing permission-boundary smoke verification.
-- Validates server-side enforcement (not UI-only) for:
--   1) public.get_clinic_realtime_metrics (requires view_analytics)
--   2) public.get_doctor_activity_report (requires view_analytics)
--   3) public.get_clinic_revenue_kpis (requires view_billing)
--
-- Usage:
--   Get-Content -Raw "supabase/snippets/verify_analytics_billing_permission_boundaries_smoke.sql" |
--     docker exec -i supabase_db_salam-queue-flow psql -v ON_ERROR_STOP=1 -U postgres -d postgres
--
-- Non-destructive: fixture writes are wrapped in a transaction and rolled back.

\set ON_ERROR_STOP on

BEGIN;

DO $$
DECLARE
  v_owner_user UUID := gen_random_uuid();
  v_analytics_user UUID := gen_random_uuid();
  v_billing_user UUID := gen_random_uuid();
  v_restricted_user UUID := gen_random_uuid();
  v_doctor_user UUID := gen_random_uuid();
  v_patient_user UUID := gen_random_uuid();

  v_clinic_id UUID := gen_random_uuid();
  v_analytics_staff_id UUID := gen_random_uuid();
  v_billing_staff_id UUID := gen_random_uuid();
  v_restricted_staff_id UUID := gen_random_uuid();
  v_doctor_staff_id UUID := gen_random_uuid();

  v_patient_id UUID := gen_random_uuid();
  v_completed_appointment_id UUID := gen_random_uuid();

  v_realtime JSONB;
  v_billing JSONB;
  v_doctor_row_count INT;
BEGIN
  INSERT INTO auth.users (id)
  VALUES
    (v_owner_user),
    (v_analytics_user),
    (v_billing_user),
    (v_restricted_user),
    (v_doctor_user),
    (v_patient_user)
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
    'Analytics Billing Guardrail Clinic',
    'General Medicine',
    '300 Governance Boulevard',
    'Casablanca',
    '+212600003001',
    'slotted',
    true,
    jsonb_build_object(
      'role_definitions', jsonb_build_array(
        jsonb_build_object(
          'key', 'analytics_staff',
          'label', 'Analytics Staff',
          'base_role', 'staff',
          'permissions', jsonb_build_object(
            'view_analytics', true,
            'view_billing', false,
            'manage_queue', false,
            'manage_appointments', false,
            'manage_medical_records', false
          )
        ),
        jsonb_build_object(
          'key', 'billing_staff',
          'label', 'Billing Staff',
          'base_role', 'staff',
          'permissions', jsonb_build_object(
            'view_analytics', false,
            'view_billing', true,
            'manage_queue', false,
            'manage_appointments', false,
            'manage_medical_records', false
          )
        ),
        jsonb_build_object(
          'key', 'restricted_staff',
          'label', 'Restricted Staff',
          'base_role', 'staff',
          'permissions', jsonb_build_object(
            'view_analytics', false,
            'view_billing', false,
            'manage_queue', false,
            'manage_appointments', false,
            'manage_medical_records', false
          )
        ),
        jsonb_build_object(
          'key', 'doctor',
          'label', 'Doctor',
          'base_role', 'doctor',
          'permissions', jsonb_build_object(
            'view_analytics', false,
            'view_billing', false,
            'manage_queue', true,
            'manage_appointments', true,
            'manage_medical_records', true
          )
        )
      )
    )
  );

  INSERT INTO public.user_roles (user_id, role, clinic_id)
  VALUES
    (v_owner_user, 'clinic_owner', v_clinic_id),
    (v_analytics_user, 'staff', v_clinic_id),
    (v_billing_user, 'staff', v_clinic_id),
    (v_restricted_user, 'staff', v_clinic_id),
    (v_doctor_user, 'staff', v_clinic_id);

  INSERT INTO public.clinic_staff (id, clinic_id, user_id, role, is_active)
  VALUES
    (v_analytics_staff_id, v_clinic_id, v_analytics_user, 'analytics_staff', true),
    (v_billing_staff_id, v_clinic_id, v_billing_user, 'billing_staff', true),
    (v_restricted_staff_id, v_clinic_id, v_restricted_user, 'restricted_staff', true),
    (v_doctor_staff_id, v_clinic_id, v_doctor_user, 'doctor', true);

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
    'Analytics Billing Patient',
    public.encrypt_patient_pii('Analytics Billing Patient'),
    public.encrypt_patient_pii('+212600003002'),
    public.encrypt_patient_pii('analytics.billing.patient@example.com'),
    public.hash_phone_number('+212600003002'),
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
    day_of_week,
    billing_amount,
    payment_status,
    paid_at,
    payment_method,
    actual_duration,
    checked_in_at,
    actual_end_time
  ) VALUES (
    v_completed_appointment_id,
    v_clinic_id,
    v_patient_id,
    v_doctor_staff_id,
    CURRENT_DATE,
    'consultation',
    'completed',
    true,
    1,
    'Analytics and billing guardrails',
    EXTRACT(ISODOW FROM CURRENT_DATE)::INT,
    350,
    'paid',
    NOW(),
    'cash',
    18,
    NOW() - INTERVAL '30 minutes',
    NOW() - INTERVAL '12 minutes'
  );

  PERFORM set_config('request.jwt.claim.role', 'authenticated', false);

  -- Restricted staff: denied for all analytics + billing RPCs.
  PERFORM set_config('request.jwt.claim.sub', v_restricted_user::TEXT, false);

  BEGIN
    PERFORM public.get_clinic_realtime_metrics(v_clinic_id);
    RAISE EXCEPTION 'Expected analytics denial for restricted staff';
  EXCEPTION
    WHEN SQLSTATE '42501' THEN
      NULL;
  END;

  BEGIN
    PERFORM public.get_doctor_activity_report(v_clinic_id, CURRENT_DATE - 7, CURRENT_DATE);
    RAISE EXCEPTION 'Expected doctor activity denial for restricted staff';
  EXCEPTION
    WHEN SQLSTATE '42501' THEN
      NULL;
  END;

  BEGIN
    PERFORM public.get_clinic_revenue_kpis(v_clinic_id);
    RAISE EXCEPTION 'Expected billing denial for restricted staff';
  EXCEPTION
    WHEN SQLSTATE '42501' THEN
      NULL;
  END;

  -- Analytics staff: allowed analytics RPCs, denied billing RPC.
  PERFORM set_config('request.jwt.claim.sub', v_analytics_user::TEXT, false);

  SELECT public.get_clinic_realtime_metrics(v_clinic_id)
  INTO v_realtime;

  IF COALESCE((v_realtime ->> 'active_staff_count')::INT, -1) < 0 THEN
    RAISE EXCEPTION 'Expected realtime analytics payload with active_staff_count, got %', v_realtime;
  END IF;

  SELECT COUNT(*)
  INTO v_doctor_row_count
  FROM public.get_doctor_activity_report(v_clinic_id, CURRENT_DATE - 7, CURRENT_DATE);

  IF v_doctor_row_count < 1 THEN
    RAISE EXCEPTION 'Expected doctor activity rows for analytics staff';
  END IF;

  BEGIN
    PERFORM public.get_clinic_revenue_kpis(v_clinic_id);
    RAISE EXCEPTION 'Expected billing denial for analytics-only staff';
  EXCEPTION
    WHEN SQLSTATE '42501' THEN
      NULL;
  END;

  -- Billing staff: allowed billing RPC, denied analytics RPCs.
  PERFORM set_config('request.jwt.claim.sub', v_billing_user::TEXT, false);

  SELECT public.get_clinic_revenue_kpis(v_clinic_id)
  INTO v_billing;

  IF NOT (v_billing ? 'day') THEN
    RAISE EXCEPTION 'Expected billing KPI payload with day section, got %', v_billing;
  END IF;

  BEGIN
    PERFORM public.get_clinic_realtime_metrics(v_clinic_id);
    RAISE EXCEPTION 'Expected realtime analytics denial for billing-only staff';
  EXCEPTION
    WHEN SQLSTATE '42501' THEN
      NULL;
  END;

  BEGIN
    PERFORM public.get_doctor_activity_report(v_clinic_id, CURRENT_DATE - 7, CURRENT_DATE);
    RAISE EXCEPTION 'Expected doctor activity denial for billing-only staff';
  EXCEPTION
    WHEN SQLSTATE '42501' THEN
      NULL;
  END;

  RAISE NOTICE 'PASS analytics + billing permission-boundary smoke';
END
$$;

ROLLBACK;
