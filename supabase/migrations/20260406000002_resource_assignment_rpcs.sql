-- P2: Atomic resource assignment during call-next + resource availability lookup.

CREATE OR REPLACE FUNCTION public._appointment_to_queue_json(
  p_appointment_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result JSONB;
BEGIN
  SELECT jsonb_build_object(
    'id', a.id,
    'clinic_id', a.clinic_id,
    'patient_id', a.patient_id,
    'staff_id', a.staff_id,
    'start_time', CASE
      WHEN a.scheduled_time IS NOT NULL THEN (a.appointment_date::text || ' ' || a.scheduled_time)::timestamptz
      ELSE NULL
    END,
    'end_time', CASE
      WHEN a.scheduled_time IS NOT NULL THEN (a.appointment_date::text || ' ' || a.scheduled_time)::timestamptz + make_interval(mins => COALESCE(a.estimated_duration, 15))
      ELSE NULL
    END,
    'appointment_date', a.appointment_date,
    'queue_position', a.queue_position,
    'status', a.status,
    'appointment_type', a.appointment_type,
    'reason_for_visit', a.reason_for_visit,
    'is_present', a.is_present,
    'marked_absent_at', a.marked_absent_at,
    'returned_at', a.returned_at,
    'checked_in_at', a.checked_in_at,
    'actual_end_time', a.actual_end_time,
    'estimated_duration', a.estimated_duration,
    'predicted_wait_time', a.predicted_wait_time,
    'prediction_mode', NULL,
    'prediction_confidence', a.prediction_confidence,
    'predicted_start_time', a.predicted_start_time,
    'last_prediction_update', a.last_prediction_update,
    'created_at', a.created_at,
    'updated_at', a.updated_at,
    'original_queue_position', a.original_queue_position,
    'skip_count', a.skip_count,
    'skip_reason', a.skip_reason,
    'override_by', a.override_by,
    'is_walk_in', a.is_walk_in,
    'priority_score', a.priority_score,
    'is_gap_filler', a.is_gap_filler,
    'promoted_from_waitlist', a.promoted_from_waitlist,
    'late_arrival_converted', a.late_arrival_converted,
    'original_slot_time', a.original_slot_time,
    'resource_id', a.resource_id,
    'resource', CASE
      WHEN cr.id IS NULL THEN NULL
      ELSE jsonb_build_object(
        'id', cr.id,
        'name', cr.name,
        'resource_type', cr.resource_type
      )
    END,
    'patient', CASE
      WHEN p.id IS NULL THEN NULL
      ELSE jsonb_build_object('id', p.id, 'display_name', p.display_name)
    END,
    'clinic', jsonb_build_object(
      'id', c.id,
      'name', c.name,
      'specialty', c.specialty,
      'city', c.city,
      'address', c.address,
      'phone', c.phone
    )
  )
  INTO v_result
  FROM public.appointments a
  JOIN public.clinics c ON c.id = a.clinic_id
  LEFT JOIN public.patients p ON p.id = a.patient_id
  LEFT JOIN public.clinic_resources cr ON cr.id = a.resource_id
  WHERE a.id = p_appointment_id;

  RETURN v_result;
END;
$$;

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

  IF NOT public._user_can_manage_clinic(v_appointment.clinic_id, auth.uid()) THEN
    RAISE EXCEPTION 'You are not allowed to manage this clinic queue' USING ERRCODE = '42501';
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

CREATE OR REPLACE FUNCTION public.get_available_clinic_resources(
  p_clinic_id UUID
)
RETURNS TABLE (
  id UUID,
  clinic_id UUID,
  name TEXT,
  resource_type TEXT,
  capacity INTEGER,
  display_order INTEGER,
  is_active BOOLEAN,
  notes TEXT,
  is_occupied BOOLEAN
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  IF p_clinic_id IS NULL THEN
    RAISE EXCEPTION 'clinic_id is required';
  END IF;

  IF NOT public._user_can_manage_clinic(p_clinic_id, auth.uid()) THEN
    RAISE EXCEPTION 'You are not allowed to view these clinic resources' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    cr.id,
    cr.clinic_id,
    cr.name,
    cr.resource_type,
    cr.capacity,
    cr.display_order,
    cr.is_active,
    cr.notes,
    EXISTS (
      SELECT 1
      FROM public.appointments a
      WHERE a.clinic_id = cr.clinic_id
        AND a.appointment_date = CURRENT_DATE
        AND a.status = 'in_progress'
        AND a.resource_id = cr.id
    ) AS is_occupied
  FROM public.clinic_resources cr
  WHERE cr.clinic_id = p_clinic_id
    AND cr.is_active = true
  ORDER BY cr.display_order ASC, lower(cr.name) ASC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.assign_resource_and_call_patient(UUID, UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_available_clinic_resources(UUID) TO authenticated;
