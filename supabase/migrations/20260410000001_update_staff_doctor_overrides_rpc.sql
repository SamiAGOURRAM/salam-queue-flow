-- Migration: Secure doctor override updates via RPC
-- Description:
-- - Add SECURITY DEFINER RPC to update doctor override columns on clinic_staff.
-- - Allow clinic owners to update any provider overrides.
-- - Allow providers to update only their own overrides.

CREATE OR REPLACE FUNCTION public.update_staff_doctor_overrides(
  p_staff_id UUID,
  p_working_hours JSONB DEFAULT NULL,
  p_appointment_types_override JSONB DEFAULT NULL,
  p_daily_queue_modes_override JSONB DEFAULT NULL
)
RETURNS public.clinic_staff
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_target public.clinic_staff%ROWTYPE;
BEGIN
  v_user_id := auth.uid();

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  IF p_staff_id IS NULL THEN
    RAISE EXCEPTION 'staff_id is required';
  END IF;

  SELECT cs.*
  INTO v_target
  FROM public.clinic_staff cs
  WHERE cs.id = p_staff_id
    AND COALESCE(cs.is_active, true) = true
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Staff member not found: %', p_staff_id;
  END IF;

  IF NOT (
    v_target.user_id = v_user_id
    OR EXISTS (
      SELECT 1
      FROM public.clinics c
      WHERE c.id = v_target.clinic_id
        AND c.owner_id = v_user_id
    )
  ) THEN
    RAISE EXCEPTION 'Not authorized to update doctor overrides for this staff profile' USING ERRCODE = '42501';
  END IF;

  IF v_target.user_id = v_user_id
    AND NOT public._is_staff_provider_role(v_target.clinic_id, v_target.role)
  THEN
    RAISE EXCEPTION 'Only provider roles can update self doctor overrides' USING ERRCODE = '42501';
  END IF;

  UPDATE public.clinic_staff cs
  SET
    working_hours = p_working_hours,
    appointment_types_override = p_appointment_types_override,
    daily_queue_modes_override = p_daily_queue_modes_override,
    updated_at = NOW()
  WHERE cs.id = p_staff_id
  RETURNING * INTO v_target;

  RETURN v_target;
END;
$$;

REVOKE ALL ON FUNCTION public.update_staff_doctor_overrides(UUID, JSONB, JSONB, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_staff_doctor_overrides(UUID, JSONB, JSONB, JSONB) TO authenticated;
