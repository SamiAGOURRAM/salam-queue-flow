-- Doctor override RPC self-edit smoke verification
-- Validates doctor can update own overrides via update_staff_doctor_overrides,
-- including custom provider role keys mapped via clinic role_definitions.
--
-- Usage:
--   Get-Content -Raw "supabase/snippets/verify_doctor_overrides_rpc_self_edit_smoke.sql" |
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
  v_updated public.clinic_staff%ROWTYPE;
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
    'Doctor Override RPC Smoke Clinic',
    'General Medicine',
    '1 RPC Smoke Avenue',
    'Rabat',
    '+212611111111',
    true,
    'slotted',
    jsonb_build_object(
      'role_definitions',
      jsonb_build_array(
        jsonb_build_object('key', 'medecin', 'label', 'Medecin', 'baseRole', 'doctor')
      )
    )
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
    working_hours,
    appointment_types_override,
    daily_queue_modes_override
  ) VALUES (
    v_staff_id,
    v_clinic_id,
    v_doctor_user,
    'medecin',
    true,
    NULL,
    NULL,
    NULL
  );

  PERFORM set_config('request.jwt.claim.role', 'authenticated', false);
  PERFORM set_config('request.jwt.claim.sub', v_doctor_user::text, false);

  SELECT *
  INTO v_updated
  FROM public.update_staff_doctor_overrides(
    v_staff_id,
    jsonb_build_object(
      'monday',
      jsonb_build_object('closed', false, 'open', '09:00', 'close', '18:00')
    ),
    jsonb_build_array(
      jsonb_build_object('name', 'consultation', 'label', 'Consultation', 'duration', 20)
    ),
    jsonb_build_object('monday', 'fluid')
  );

  IF COALESCE(v_updated.daily_queue_modes_override ->> 'monday', '') <> 'fluid' THEN
    RAISE EXCEPTION 'Expected updated daily_queue_modes_override monday=fluid, got %', v_updated.daily_queue_modes_override;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.clinic_staff cs
    WHERE cs.id = v_staff_id
      AND COALESCE(cs.daily_queue_modes_override ->> 'monday', '') = 'fluid'
  ) THEN
    RAISE EXCEPTION 'Expected persisted override update for staff %', v_staff_id;
  END IF;

  RAISE NOTICE 'PASS doctor self-update via update_staff_doctor_overrides RPC (custom provider role)';
END
$$;

ROLLBACK;
