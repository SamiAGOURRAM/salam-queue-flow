-- =====================================================
-- Gate queue actions server-side by granular permissions.
-- =====================================================
-- Until now:
--   * `Staff can update clinic appointments` allowed any clinic_owner/staff
--     to UPDATE any row on `appointments`, regardless of custom-role perms.
--   * `assign_resource_and_call_patient` only checked scope, not perms.
-- Now:
--   * Appointments UPDATE requires at least one of
--     `manage_queue`, `manage_appointments`, `manage_medical_records`.
--     A custom role with none of these cannot touch an appointment row.
--   * The call-next RPC additionally asserts `manage_queue`.
-- =====================================================

-- Split update policy so each action has its own gate.
DROP POLICY IF EXISTS "Staff can update clinic appointments" ON public.appointments;

CREATE POLICY "Staff can update clinic appointments"
  ON public.appointments FOR UPDATE
  USING (
    public._user_has_clinic_permission(clinic_id, auth.uid(), 'manage_queue')
    OR public._user_has_clinic_permission(clinic_id, auth.uid(), 'manage_appointments')
    OR public._user_has_clinic_permission(clinic_id, auth.uid(), 'manage_medical_records')
  )
  WITH CHECK (
    public._user_has_clinic_permission(clinic_id, auth.uid(), 'manage_queue')
    OR public._user_has_clinic_permission(clinic_id, auth.uid(), 'manage_appointments')
    OR public._user_has_clinic_permission(clinic_id, auth.uid(), 'manage_medical_records')
  );

-- Tighten INSERT: only staff with manage_appointments can create appointments.
-- (Patient self-booking has its own separate policy.)
DROP POLICY IF EXISTS "Staff can create clinic appointments" ON public.appointments;
CREATE POLICY "Staff can create clinic appointments"
  ON public.appointments FOR INSERT
  WITH CHECK (
    public._user_has_clinic_permission(clinic_id, auth.uid(), 'manage_appointments')
  );

-- =====================================================
-- Require manage_queue inside the primary call-next RPC.
-- =====================================================
CREATE OR REPLACE FUNCTION public.assign_resource_and_call_patient(
  p_appointment_id UUID,
  p_resource_id UUID DEFAULT NULL,
  p_performed_by UUID DEFAULT auth.uid()
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_appointment public.appointments%ROWTYPE;
BEGIN
  IF p_appointment_id IS NULL THEN
    RAISE EXCEPTION 'appointment_id is required';
  END IF;

  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  IF p_performed_by IS NULL OR p_performed_by <> auth.uid() THEN
    RAISE EXCEPTION 'performed_by must match the authenticated user' USING ERRCODE = '42501';
  END IF;

  SELECT *
  INTO v_appointment
  FROM public.appointments a
  WHERE a.id = p_appointment_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Appointment not found: %', p_appointment_id;
  END IF;

  IF NOT public._user_can_manage_appointment_with_scope(v_appointment.id, auth.uid()) THEN
    RAISE EXCEPTION 'You are not allowed to manage this provider queue' USING ERRCODE = '42501';
  END IF;

  IF NOT public._user_has_clinic_permission(v_appointment.clinic_id, auth.uid(), 'manage_queue') THEN
    RAISE EXCEPTION 'You do not have permission to manage the queue' USING ERRCODE = '42501';
  END IF;

  IF v_appointment.status NOT IN ('scheduled', 'waiting') THEN
    RAISE EXCEPTION 'Only scheduled or waiting appointments can be called. Current status: %', v_appointment.status;
  END IF;

  IF COALESCE(v_appointment.is_present, false) = false THEN
    RAISE EXCEPTION 'Patient is not marked present for appointment %', p_appointment_id;
  END IF;

  IF p_resource_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public.clinic_resources cr
      WHERE cr.id = p_resource_id
        AND cr.clinic_id = v_appointment.clinic_id
        AND cr.is_active = true
    ) THEN
      RAISE EXCEPTION 'Selected resource is invalid, inactive, or not in this clinic';
    END IF;

    IF EXISTS (
      SELECT 1
      FROM public.appointments a
      WHERE a.clinic_id = v_appointment.clinic_id
        AND a.appointment_date = v_appointment.appointment_date
        AND a.status = 'in_progress'
        AND a.resource_id = p_resource_id
        AND a.id <> p_appointment_id
    ) THEN
      RAISE EXCEPTION 'Selected resource is currently occupied';
    END IF;
  END IF;

  UPDATE public.appointments a
  SET
    status = 'in_progress',
    checked_in_at = COALESCE(a.checked_in_at, NOW()),
    resource_id = p_resource_id,
    updated_at = NOW()
  WHERE a.id = p_appointment_id;

  RETURN public._appointment_to_queue_json(p_appointment_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.assign_resource_and_call_patient(UUID, UUID, UUID) TO authenticated;
