-- Harden queue assignment authorization.
-- 1) Only clinic owners/super_admin can mutate staff_queue_assignments.
-- 2) Trigger rejects provider principals for defense-in-depth.

CREATE OR REPLACE FUNCTION public._validate_staff_queue_assignment()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_principal_role TEXT;
  v_target_role TEXT;
BEGIN
  IF NEW.clinic_id IS NULL OR NEW.staff_id IS NULL OR NEW.assigned_staff_id IS NULL THEN
    RAISE EXCEPTION 'clinic_id, staff_id, and assigned_staff_id are required';
  END IF;

  SELECT target_staff.role
  INTO v_principal_role
  FROM public.clinic_staff target_staff
  WHERE target_staff.id = NEW.staff_id
    AND target_staff.clinic_id = NEW.clinic_id
    AND COALESCE(target_staff.is_active, true) = true
  LIMIT 1;

  IF v_principal_role IS NULL THEN
    RAISE EXCEPTION 'Target staff member is invalid or inactive';
  END IF;

  IF public._is_staff_provider_role(NEW.clinic_id, v_principal_role) THEN
    RAISE EXCEPTION 'Provider roles cannot be assigned a queue subset';
  END IF;

  SELECT provider.role
  INTO v_target_role
  FROM public.clinic_staff provider
  WHERE provider.id = NEW.assigned_staff_id
    AND provider.clinic_id = NEW.clinic_id
    AND COALESCE(provider.is_active, true) = true
  LIMIT 1;

  IF v_target_role IS NULL THEN
    RAISE EXCEPTION 'Assigned staff member is invalid or inactive';
  END IF;

  IF NOT public._is_staff_provider_role(NEW.clinic_id, v_target_role) THEN
    RAISE EXCEPTION 'Assigned staff member must be a provider role';
  END IF;

  RETURN NEW;
END;
$$;

DROP POLICY IF EXISTS "Staff can manage queue assignments" ON public.staff_queue_assignments;
CREATE POLICY "Staff can manage queue assignments"
  ON public.staff_queue_assignments
  FOR ALL
  USING (
    EXISTS (
      SELECT 1
      FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.clinic_id = staff_queue_assignments.clinic_id
        AND ur.role IN ('super_admin', 'clinic_owner')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.clinic_id = staff_queue_assignments.clinic_id
        AND ur.role IN ('super_admin', 'clinic_owner')
    )
  );

CREATE OR REPLACE FUNCTION public.replace_staff_queue_assignments(
  p_staff_id UUID,
  p_assigned_staff_ids UUID[] DEFAULT ARRAY[]::UUID[]
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_target_staff public.clinic_staff%ROWTYPE;
  v_is_provider_target BOOLEAN := false;
  v_requested_count INTEGER := 0;
  v_inserted_count INTEGER := 0;
  v_result_ids UUID[] := ARRAY[]::UUID[];
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  IF p_staff_id IS NULL THEN
    RAISE EXCEPTION 'staff_id is required';
  END IF;

  SELECT *
  INTO v_target_staff
  FROM public.clinic_staff cs
  WHERE cs.id = p_staff_id
    AND COALESCE(cs.is_active, true) = true
  LIMIT 1;

  IF v_target_staff.id IS NULL THEN
    RAISE EXCEPTION 'Staff member not found: %', p_staff_id;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
      AND ur.clinic_id = v_target_staff.clinic_id
      AND ur.role IN ('super_admin', 'clinic_owner')
  ) THEN
    RAISE EXCEPTION 'Only clinic owners can manage queue assignments' USING ERRCODE = '42501';
  END IF;

  v_is_provider_target := public._is_staff_provider_role(v_target_staff.clinic_id, v_target_staff.role);

  IF v_is_provider_target THEN
    RAISE EXCEPTION 'Provider roles manage their own queue scope and cannot be assigned provider subsets';
  END IF;

  IF p_assigned_staff_ids IS NULL THEN
    p_assigned_staff_ids := ARRAY[]::UUID[];
  END IF;

  SELECT COUNT(DISTINCT requested_staff_id)
  INTO v_requested_count
  FROM unnest(p_assigned_staff_ids) AS requested_staff_id;

  DELETE FROM public.staff_queue_assignments sqa
  WHERE sqa.clinic_id = v_target_staff.clinic_id
    AND sqa.staff_id = p_staff_id;

  IF v_requested_count > 0 THEN
    INSERT INTO public.staff_queue_assignments (
      clinic_id,
      staff_id,
      assigned_staff_id,
      created_by
    )
    SELECT
      v_target_staff.clinic_id,
      p_staff_id,
      provider.id,
      auth.uid()
    FROM (
      SELECT DISTINCT requested_staff_id AS id
      FROM unnest(p_assigned_staff_ids) AS requested_staff_id
    ) AS requested
    JOIN public.clinic_staff provider
      ON provider.id = requested.id
     AND provider.clinic_id = v_target_staff.clinic_id
     AND COALESCE(provider.is_active, true) = true
    WHERE public._is_staff_provider_role(v_target_staff.clinic_id, provider.role);

    GET DIAGNOSTICS v_inserted_count = ROW_COUNT;

    IF v_inserted_count <> v_requested_count THEN
      RAISE EXCEPTION 'One or more assigned staff ids are invalid, inactive, or not provider roles';
    END IF;
  END IF;

  SELECT COALESCE(array_agg(sqa.assigned_staff_id ORDER BY sqa.assigned_staff_id), ARRAY[]::UUID[])
  INTO v_result_ids
  FROM public.staff_queue_assignments sqa
  WHERE sqa.clinic_id = v_target_staff.clinic_id
    AND sqa.staff_id = p_staff_id;

  RETURN jsonb_build_object(
    'clinic_id', v_target_staff.clinic_id,
    'staff_id', p_staff_id,
    'assigned_staff_ids', to_jsonb(v_result_ids)
  );
END;
$$;
