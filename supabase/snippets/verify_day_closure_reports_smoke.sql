-- Day-closure persisted artifact smoke verification.
-- Validates:
-- 1) Preview metrics reflect current queue state for a provider/date.
-- 2) end_day_for_staff writes/updates persisted report artifact.
-- 3) Duplicate same-date closure updates existing report (no duplicate rows).
-- 4) Owner can read clinic history; provider can read own history.
--
-- Usage:
--   Get-Content -Raw "supabase/snippets/verify_day_closure_reports_smoke.sql" |
--     docker exec -i supabase_db_salam-queue-flow psql -v ON_ERROR_STOP=1 -U postgres -d postgres
--
-- Non-destructive: all fixture writes are wrapped in a transaction and rolled back.

\set ON_ERROR_STOP on

BEGIN;

DO $$
DECLARE
  v_owner_user UUID := gen_random_uuid();
  v_doctor_user UUID := gen_random_uuid();
  v_patient_user UUID := gen_random_uuid();
  v_clinic_id UUID := gen_random_uuid();
  v_staff_id UUID := gen_random_uuid();
  v_patient_id UUID := gen_random_uuid();
  v_waiting_appt UUID := gen_random_uuid();
  v_in_progress_appt UUID := gen_random_uuid();
  v_completed_appt UUID := gen_random_uuid();
  v_no_show_appt UUID := gen_random_uuid();
  v_preview JSONB;
  v_result_one JSONB;
  v_result_two JSONB;
  v_history_owner JSONB;
  v_history_doctor JSONB;
  v_report_rows INT;
BEGIN
  INSERT INTO auth.users (id)
  VALUES (v_owner_user), (v_doctor_user), (v_patient_user)
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
    'Day Closure Smoke Clinic',
    'General Medicine',
    '1 Closure Avenue',
    'Rabat',
    '+212600009001',
    true,
    'slotted',
    '{}'::jsonb
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
    is_active
  ) VALUES (
    v_staff_id,
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
    'Day Closure Patient',
    public.encrypt_patient_pii('Day Closure Patient'),
    public.encrypt_patient_pii('+212600009002'),
    public.encrypt_patient_pii('dayclosure.patient@example.com'),
    public.hash_phone_number('+212600009002'),
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
    notes,
    actual_duration,
    day_of_week
  ) VALUES
  (
    v_waiting_appt,
    v_clinic_id,
    v_patient_id,
    v_staff_id,
    CURRENT_DATE,
    'consultation',
    'waiting',
    true,
    1,
    'Waiting before closure',
    'n/a',
    15,
    EXTRACT(ISODOW FROM CURRENT_DATE)::INT
  ),
  (
    v_in_progress_appt,
    v_clinic_id,
    v_patient_id,
    v_staff_id,
    CURRENT_DATE,
    'consultation',
    'in_progress',
    true,
    2,
    'In progress before closure',
    'n/a',
    15,
    EXTRACT(ISODOW FROM CURRENT_DATE)::INT
  ),
  (
    v_completed_appt,
    v_clinic_id,
    v_patient_id,
    v_staff_id,
    CURRENT_DATE,
    'consultation',
    'completed',
    true,
    NULL,
    'Completed before closure',
    'n/a',
    15,
    EXTRACT(ISODOW FROM CURRENT_DATE)::INT
  ),
  (
    v_no_show_appt,
    v_clinic_id,
    v_patient_id,
    v_staff_id,
    CURRENT_DATE,
    'consultation',
    'no_show',
    false,
    NULL,
    'No-show before closure',
    'n/a',
    15,
    EXTRACT(ISODOW FROM CURRENT_DATE)::INT
  );

  PERFORM set_config('request.jwt.claim.role', 'authenticated', false);
  PERFORM set_config('request.jwt.claim.sub', v_owner_user::text, false);

  SELECT public.get_day_closure_preview(v_staff_id, v_clinic_id, CURRENT_DATE)
  INTO v_preview;

  IF COALESCE((v_preview ->> 'willMarkNoShow')::INT, -1) <> 1
     OR COALESCE((v_preview ->> 'willMarkCompleted')::INT, -1) <> 1
  THEN
    RAISE EXCEPTION 'Expected preview to mark 1 no-show + 1 completed, got %', v_preview;
  END IF;

  SELECT public.end_day_for_staff(
    v_staff_id,
    v_clinic_id,
    CURRENT_DATE,
    v_owner_user,
    'End of day smoke close',
    'Smoke note'
  )
  INTO v_result_one;

  IF COALESCE((v_result_one -> 'summary' ->> 'markedNoShow')::INT, -1) <> 1
     OR COALESCE((v_result_one -> 'summary' ->> 'markedCompleted')::INT, -1) <> 1
  THEN
    RAISE EXCEPTION 'Expected first closure summary (1,1), got %', v_result_one;
  END IF;

  SELECT public.end_day_for_staff(
    v_staff_id,
    v_clinic_id,
    CURRENT_DATE,
    v_owner_user,
    'Repeat close same day',
    'Second pass note'
  )
  INTO v_result_two;

  IF COALESCE((v_result_two -> 'summary' ->> 'markedNoShow')::INT, -1) <> 0
     OR COALESCE((v_result_two -> 'summary' ->> 'markedCompleted')::INT, -1) <> 0
  THEN
    RAISE EXCEPTION 'Expected second closure summary (0,0), got %', v_result_two;
  END IF;

  SELECT COUNT(*)
  INTO v_report_rows
  FROM public.clinic_day_closure_reports report
  WHERE report.clinic_id = v_clinic_id
    AND report.staff_id = v_staff_id
    AND report.closure_date = CURRENT_DATE;

  IF v_report_rows <> 1 THEN
    RAISE EXCEPTION 'Expected single upserted day-closure report row, got %', v_report_rows;
  END IF;

  SELECT public.get_day_closure_history(v_clinic_id, NULL, 10, 0)
  INTO v_history_owner;

  IF COALESCE(jsonb_typeof(v_history_owner), '') <> 'array'
     OR jsonb_array_length(v_history_owner) < 1
  THEN
    RAISE EXCEPTION 'Expected owner history array with rows, got %', v_history_owner;
  END IF;

  PERFORM set_config('request.jwt.claim.sub', v_doctor_user::text, false);

  SELECT public.get_day_closure_history(v_clinic_id, NULL, 10, 0)
  INTO v_history_doctor;

  IF COALESCE(jsonb_typeof(v_history_doctor), '') <> 'array'
     OR jsonb_array_length(v_history_doctor) < 1
  THEN
    RAISE EXCEPTION 'Expected provider own history array with rows, got %', v_history_doctor;
  END IF;

  RAISE NOTICE 'PASS day-closure persisted artifact smoke';
END
$$;

ROLLBACK;
