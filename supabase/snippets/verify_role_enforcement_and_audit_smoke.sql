-- Role enforcement + audit smoke verification.
-- Validates:
-- 1) Queue/resource and medical-sharing RPCs enforce granular permissions server-side.
-- 2) Role-change operations produce audit log records.
-- 3) clinic_staff <-> user_roles staff membership sync trigger reduces drift.
--
-- Usage:
--   Get-Content -Raw "supabase/snippets/verify_role_enforcement_and_audit_smoke.sql" |
--     docker exec -i supabase_db_salam-queue-flow psql -v ON_ERROR_STOP=1 -U postgres -d postgres
--
-- Non-destructive: fixture writes are wrapped in a transaction and rolled back.

\set ON_ERROR_STOP on

BEGIN;

DO $$
DECLARE
  v_owner_user UUID := gen_random_uuid();
  v_manager_user UUID := gen_random_uuid();
  v_restricted_user UUID := gen_random_uuid();
  v_doctor_user UUID := gen_random_uuid();
  v_patient_user UUID := gen_random_uuid();
  v_sync_user UUID := gen_random_uuid();

  v_clinic_id UUID := gen_random_uuid();
  v_manager_staff_id UUID := gen_random_uuid();
  v_restricted_staff_id UUID := gen_random_uuid();
  v_doctor_staff_id UUID := gen_random_uuid();
  v_sync_staff_id UUID := gen_random_uuid();
  v_patient_id UUID := gen_random_uuid();
  v_appointment_id UUID := gen_random_uuid();

  v_scope JSONB;
BEGIN
  INSERT INTO auth.users (id)
  VALUES
    (v_owner_user),
    (v_manager_user),
    (v_restricted_user),
    (v_doctor_user),
    (v_patient_user),
    (v_sync_user)
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
    'Role Enforcement Smoke Clinic',
    'General Medicine',
    '200 Security Avenue',
    'Rabat',
    '+212600002001',
    'slotted',
    true,
    jsonb_build_object(
      'role_definitions', jsonb_build_array(
        jsonb_build_object(
          'key', 'role_manager',
          'label', 'Role Manager',
          'base_role', 'staff',
          'permissions', jsonb_build_object(
            'manage_team', true,
            'manage_roles', true,
            'view_queue', true,
            'manage_queue', true,
            'manage_appointments', true,
            'manage_medical_records', false
          )
        ),
        jsonb_build_object(
          'key', 'restricted_staff',
          'label', 'Restricted Staff',
          'base_role', 'staff',
          'permissions', jsonb_build_object(
            'view_queue', false,
            'manage_queue', false,
            'manage_appointments', false,
            'manage_medical_records', false,
            'manage_team', false,
            'manage_roles', false
          )
        ),
        jsonb_build_object(
          'key', 'doctor',
          'label', 'Doctor',
          'base_role', 'doctor',
          'permissions', jsonb_build_object(
            'manage_medical_records', true,
            'view_queue', true,
            'manage_queue', true
          )
        )
      )
    )
  );

  INSERT INTO public.user_roles (user_id, role, clinic_id)
  VALUES
    (v_owner_user, 'clinic_owner', v_clinic_id),
    (v_manager_user, 'staff', v_clinic_id),
    (v_restricted_user, 'staff', v_clinic_id),
    (v_doctor_user, 'staff', v_clinic_id);

  INSERT INTO public.clinic_staff (
    id,
    clinic_id,
    user_id,
    role,
    is_active
  ) VALUES
    (v_manager_staff_id, v_clinic_id, v_manager_user, 'role_manager', true),
    (v_restricted_staff_id, v_clinic_id, v_restricted_user, 'restricted_staff', true),
    (v_doctor_staff_id, v_clinic_id, v_doctor_user, 'doctor', true),
    -- Intentionally without pre-inserted user_roles row to verify sync trigger.
    (v_sync_staff_id, v_clinic_id, v_sync_user, 'restricted_staff', true);

  IF NOT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    WHERE ur.user_id = v_sync_user
      AND ur.clinic_id = v_clinic_id
      AND ur.role = 'staff'
  ) THEN
    RAISE EXCEPTION 'Expected clinic_staff insert to sync user_roles staff row';
  END IF;

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
    'Role Enforcement Patient',
    public.encrypt_patient_pii('Role Enforcement Patient'),
    public.encrypt_patient_pii('+212600002002'),
    public.encrypt_patient_pii('role.patient@example.com'),
    public.hash_phone_number('+212600002002'),
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
    'Role enforcement smoke',
    EXTRACT(ISODOW FROM CURRENT_DATE)::INT
  );

  PERFORM set_config('request.jwt.claim.role', 'authenticated', false);

  PERFORM set_config('request.jwt.claim.sub', v_restricted_user::text, false);

  BEGIN
    PERFORM public.get_available_clinic_resources(v_clinic_id);
    RAISE EXCEPTION 'Expected queue resource access denial for restricted staff';
  EXCEPTION
    WHEN SQLSTATE '42501' THEN
      NULL;
  END;

  BEGIN
    PERFORM public.request_medical_record_access(
      v_patient_id,
      v_appointment_id,
      v_clinic_id,
      NULL,
      jsonb_build_object('type', 'full_history')
    );
    RAISE EXCEPTION 'Expected medical access request denial for restricted staff';
  EXCEPTION
    WHEN SQLSTATE '42501' THEN
      NULL;
  END;

  PERFORM set_config('request.jwt.claim.sub', v_manager_user::text, false);

  SELECT public.resolve_queue_scope_for_staff(v_restricted_staff_id)
  INTO v_scope;

  IF COALESCE(v_scope ->> 'clinic_id', '') <> v_clinic_id::text THEN
    RAISE EXCEPTION 'Expected manage_team role to resolve queue scope for another staff member, got %', v_scope;
  END IF;

  PERFORM set_config('request.jwt.claim.sub', v_owner_user::text, false);

  UPDATE public.clinic_staff
  SET role = 'role_manager', updated_at = NOW()
  WHERE id = v_restricted_staff_id;

  IF NOT EXISTS (
    SELECT 1
    FROM public.audit_logs al
    WHERE al.clinic_id = v_clinic_id
      AND al.entity_type = 'clinic_staff_role'
      AND al.entity_id = v_restricted_staff_id
      AND al.action = 'clinic_staff_role_updated'
  ) THEN
    RAISE EXCEPTION 'Expected clinic_staff role update audit record';
  END IF;

  UPDATE public.clinic_staff
  SET is_active = false, updated_at = NOW()
  WHERE id = v_sync_staff_id;

  IF EXISTS (
    SELECT 1
    FROM public.user_roles ur
    WHERE ur.user_id = v_sync_user
      AND ur.clinic_id = v_clinic_id
      AND ur.role = 'staff'
  ) THEN
    RAISE EXCEPTION 'Expected user_roles staff row cleanup when clinic_staff is deactivated';
  END IF;

  RAISE NOTICE 'PASS role-enforcement + audit smoke';
END
$$;

ROLLBACK;
