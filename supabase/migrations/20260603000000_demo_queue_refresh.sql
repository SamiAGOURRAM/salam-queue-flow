-- Demo mode: self-healing "today's queue" for the showcase.
--
-- Demo appointments are date-stamped, so they go stale when the date rolls over.
-- This idempotent function rebuilds TODAY's queue for the demo clinic, resolving
-- the owner/doctor from existing seeded data. The /demo launcher calls it (as
-- anon) before sign-in, so recruiters always get a populated queue on any day.
--
-- One-time persona/user creation still happens in scripts/seed-demo.mjs.

CREATE OR REPLACE FUNCTION public.refresh_demo_queue()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_clinic uuid := '00000000-0000-0000-0000-00000000c201'; -- Casa Family Care (demo)
  v_owner uuid;
  v_doctor_staff uuid;
  v_patient_user uuid;
  p1 uuid; p2 uuid; p3 uuid; p4 uuid; p5 uuid; p6 uuid;
BEGIN
  SELECT owner_id INTO v_owner FROM public.clinics WHERE id = v_clinic;
  SELECT id INTO v_doctor_staff
    FROM public.clinic_staff
    WHERE clinic_id = v_clinic AND lower(role) = 'doctor' AND COALESCE(is_active, true)
    ORDER BY created_at
    LIMIT 1;
  SELECT id INTO v_patient_user FROM auth.users WHERE email = 'demo.patient@queuemed.test' LIMIT 1;

  -- Demo personas not seeded yet — run `pnpm --filter @queuemed/web run seed:demo`.
  IF v_owner IS NULL OR v_doctor_staff IS NULL THEN
    RETURN;
  END IF;

  -- Reset today's demo queue (idempotent).
  DELETE FROM public.appointments WHERE clinic_id = v_clinic AND appointment_date = CURRENT_DATE;
  DELETE FROM public.patients WHERE created_by = v_owner;

  -- Patients (encryption handled by create_patient). The patient persona is
  -- linked to its auth user so its "My Appointments" is populated.
  p1 := public.create_patient('Mehdi Cherkaoui', '+212600000004', 'demo.patient@queuemed.test', 'app', v_patient_user, v_owner, true, true);
  p2 := public.create_patient('Fatima Zahra Bennani', '+212611000012', NULL, 'app', NULL, v_owner, true, true);
  p3 := public.create_patient('Omar Idrissi', '+212611000013', NULL, 'app', NULL, v_owner, true, true);
  p4 := public.create_patient('Khadija Tazi', '+212611000014', NULL, 'walk_in', NULL, v_owner, true, true);
  p5 := public.create_patient('Youssef Alaoui', '+212611000015', NULL, 'app', NULL, v_owner, true, true);
  p6 := public.create_patient('Rachid Berrada', '+212611000016', NULL, 'app', NULL, v_owner, true, true);

  -- Today's queue: 1 completed, 1 in-progress, 3 waiting, 1 scheduled.
  INSERT INTO public.appointments
    (clinic_id, patient_id, staff_id, appointment_date, scheduled_time, appointment_type, status, reason_for_visit,
     queue_position, is_walk_in, is_present, booking_method, estimated_duration, checked_in_at, actual_end_time, actual_duration, billing_amount, payment_status)
  VALUES
    (v_clinic, p6, v_doctor_staff, CURRENT_DATE, '08:30', 'consultation', 'completed', 'Suivi tension', NULL, false, true, 'online', 15, now() - interval '90 min', now() - interval '75 min', 15, 200, 'paid'),
    (v_clinic, p2, v_doctor_staff, CURRENT_DATE, '09:00', 'consultation', 'in_progress', 'Douleurs abdominales', 1, false, true, 'online', 15, now() - interval '10 min', NULL, NULL, 200, 'unpaid'),
    (v_clinic, p1, v_doctor_staff, CURRENT_DATE, '09:30', 'consultation', 'waiting', 'Consultation générale', 2, false, true, 'online', 15, now() - interval '5 min', NULL, NULL, 200, 'unpaid'),
    (v_clinic, p3, v_doctor_staff, CURRENT_DATE, '10:00', 'follow_up', 'waiting', 'Contrôle', 3, false, true, 'online', 15, NULL, NULL, NULL, 200, 'unpaid'),
    (v_clinic, p4, v_doctor_staff, CURRENT_DATE, '10:15', 'consultation', 'waiting', 'Sans rendez-vous', 4, true, true, 'walk_in', 15, NULL, NULL, NULL, 200, 'unpaid'),
    (v_clinic, p5, v_doctor_staff, CURRENT_DATE, '10:30', 'consultation', 'scheduled', 'Vaccination', 5, false, true, 'online', 15, NULL, NULL, NULL, 200, 'unpaid');
END;
$$;

GRANT EXECUTE ON FUNCTION public.refresh_demo_queue() TO anon, authenticated;
