-- Queue scope hardening for multi-doctor clinics.
-- Adds receptionist queue assignments + scope-aware schedule RPCs.

CREATE UNIQUE INDEX IF NOT EXISTS idx_clinic_staff_clinic_id_id_unique
  ON public.clinic_staff(clinic_id, id);

CREATE TABLE IF NOT EXISTS public.staff_queue_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id UUID NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  staff_id UUID NOT NULL,
  assigned_staff_id UUID NOT NULL,
  created_by UUID NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT staff_queue_assignments_unique UNIQUE (clinic_id, staff_id, assigned_staff_id),
  CONSTRAINT staff_queue_assignments_not_self CHECK (staff_id <> assigned_staff_id),
  CONSTRAINT staff_queue_assignments_staff_fk
    FOREIGN KEY (clinic_id, staff_id)
    REFERENCES public.clinic_staff(clinic_id, id)
    ON DELETE CASCADE,
  CONSTRAINT staff_queue_assignments_assigned_staff_fk
    FOREIGN KEY (clinic_id, assigned_staff_id)
    REFERENCES public.clinic_staff(clinic_id, id)
    ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_staff_queue_assignments_staff
  ON public.staff_queue_assignments(clinic_id, staff_id);

CREATE INDEX IF NOT EXISTS idx_staff_queue_assignments_assigned
  ON public.staff_queue_assignments(clinic_id, assigned_staff_id);

CREATE OR REPLACE FUNCTION public._is_staff_provider_role(
  p_clinic_id UUID,
  p_role_key TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_normalized_role TEXT;
BEGIN
  v_normalized_role := lower(coalesce(p_role_key, ''));

  IF v_normalized_role = 'doctor' THEN
    RETURN true;
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM public.clinics c
    CROSS JOIN LATERAL jsonb_array_elements(
      COALESCE(c.settings::jsonb -> 'role_definitions', '[]'::jsonb)
    ) AS role_def
    WHERE c.id = p_clinic_id
      AND lower(coalesce(role_def ->> 'key', '')) = v_normalized_role
      AND lower(
        coalesce(
          role_def ->> 'base_role',
          role_def ->> 'baseRole',
          ''
        )
      ) = 'doctor'
  );
END;
$$;

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

DROP TRIGGER IF EXISTS validate_staff_queue_assignments ON public.staff_queue_assignments;
CREATE TRIGGER validate_staff_queue_assignments
  BEFORE INSERT OR UPDATE ON public.staff_queue_assignments
  FOR EACH ROW
  EXECUTE FUNCTION public._validate_staff_queue_assignment();

DROP TRIGGER IF EXISTS update_staff_queue_assignments_updated_at ON public.staff_queue_assignments;
CREATE TRIGGER update_staff_queue_assignments_updated_at
  BEFORE UPDATE ON public.staff_queue_assignments
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.staff_queue_assignments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Staff can view queue assignments" ON public.staff_queue_assignments;
CREATE POLICY "Staff can view queue assignments"
  ON public.staff_queue_assignments
  FOR SELECT
  USING (public._user_can_manage_clinic(clinic_id, auth.uid()));

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

CREATE OR REPLACE FUNCTION public._resolve_queue_scope_for_user(
  p_clinic_id UUID,
  p_user_id UUID DEFAULT auth.uid()
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_owner BOOLEAN := false;
  v_requester_staff_id UUID;
  v_requester_role TEXT;
  v_is_provider BOOLEAN := false;
  v_assigned_staff_ids UUID[] := ARRAY[]::UUID[];
BEGIN
  IF p_clinic_id IS NULL THEN
    RAISE EXCEPTION 'clinic_id is required';
  END IF;

  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.clinics c
    WHERE c.id = p_clinic_id
      AND c.owner_id = p_user_id
  )
  INTO v_is_owner;

  IF NOT v_is_owner AND NOT public._user_can_manage_clinic(p_clinic_id, p_user_id) THEN
    RAISE EXCEPTION 'You are not allowed to access this clinic queue' USING ERRCODE = '42501';
  END IF;

  SELECT cs.id, cs.role
  INTO v_requester_staff_id, v_requester_role
  FROM public.clinic_staff cs
  WHERE cs.clinic_id = p_clinic_id
    AND cs.user_id = p_user_id
    AND COALESCE(cs.is_active, true) = true
  ORDER BY cs.created_at ASC NULLS LAST, cs.id ASC
  LIMIT 1;

  IF v_requester_staff_id IS NULL THEN
    RETURN jsonb_build_object(
      'clinic_id', p_clinic_id,
      'requester_staff_id', NULL,
      'scope_mode', 'clinic',
      'is_clinic_wide', true,
      'is_owner', v_is_owner,
      'is_provider', false,
      'allowed_staff_ids', '[]'::jsonb
    );
  END IF;

  v_is_provider := public._is_staff_provider_role(p_clinic_id, v_requester_role);

  IF NOT v_is_owner AND v_is_provider THEN
    RETURN jsonb_build_object(
      'clinic_id', p_clinic_id,
      'requester_staff_id', v_requester_staff_id,
      'scope_mode', 'provider',
      'is_clinic_wide', false,
      'is_owner', false,
      'is_provider', true,
      'allowed_staff_ids', to_jsonb(ARRAY[v_requester_staff_id]::UUID[])
    );
  END IF;

  SELECT COALESCE(array_agg(DISTINCT sqa.assigned_staff_id ORDER BY sqa.assigned_staff_id), ARRAY[]::UUID[])
  INTO v_assigned_staff_ids
  FROM public.staff_queue_assignments sqa
  JOIN public.clinic_staff provider
    ON provider.id = sqa.assigned_staff_id
   AND provider.clinic_id = p_clinic_id
   AND COALESCE(provider.is_active, true) = true
  WHERE sqa.clinic_id = p_clinic_id
    AND sqa.staff_id = v_requester_staff_id;

  IF NOT v_is_owner AND COALESCE(array_length(v_assigned_staff_ids, 1), 0) > 0 THEN
    RETURN jsonb_build_object(
      'clinic_id', p_clinic_id,
      'requester_staff_id', v_requester_staff_id,
      'scope_mode', 'restricted',
      'is_clinic_wide', false,
      'is_owner', false,
      'is_provider', false,
      'allowed_staff_ids', to_jsonb(v_assigned_staff_ids)
    );
  END IF;

  RETURN jsonb_build_object(
    'clinic_id', p_clinic_id,
    'requester_staff_id', v_requester_staff_id,
    'scope_mode', 'clinic',
    'is_clinic_wide', true,
    'is_owner', v_is_owner,
    'is_provider', v_is_provider,
    'allowed_staff_ids', '[]'::jsonb
  );
END;
$$;

CREATE OR REPLACE FUNCTION public._user_can_manage_appointment_with_scope(
  p_appointment_id UUID,
  p_user_id UUID DEFAULT auth.uid()
)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_appointment public.appointments%ROWTYPE;
  v_scope JSONB;
  v_scope_mode TEXT;
  v_allowed_staff_ids UUID[] := ARRAY[]::UUID[];
BEGIN
  IF p_appointment_id IS NULL OR p_user_id IS NULL THEN
    RETURN false;
  END IF;

  SELECT *
  INTO v_appointment
  FROM public.appointments a
  WHERE a.id = p_appointment_id
  LIMIT 1;

  IF v_appointment.id IS NULL THEN
    RETURN false;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.clinics c
    WHERE c.id = v_appointment.clinic_id
      AND c.owner_id = p_user_id
  ) THEN
    RETURN true;
  END IF;

  IF NOT public._user_can_manage_clinic(v_appointment.clinic_id, p_user_id) THEN
    RETURN false;
  END IF;

  v_scope := public._resolve_queue_scope_for_user(v_appointment.clinic_id, p_user_id);
  v_scope_mode := COALESCE(v_scope ->> 'scope_mode', 'clinic');

  IF v_scope_mode = 'clinic' THEN
    RETURN true;
  END IF;

  IF v_appointment.staff_id IS NULL THEN
    RETURN false;
  END IF;

  SELECT COALESCE(array_agg(scope_staff_id::UUID), ARRAY[]::UUID[])
  INTO v_allowed_staff_ids
  FROM jsonb_array_elements_text(COALESCE(v_scope -> 'allowed_staff_ids', '[]'::jsonb)) AS scope_staff_id;

  RETURN v_appointment.staff_id = ANY(v_allowed_staff_ids);
END;
$$;

CREATE OR REPLACE FUNCTION public.resolve_queue_scope_for_staff(
  p_staff_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_staff public.clinic_staff%ROWTYPE;
  v_scope JSONB;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  IF p_staff_id IS NULL THEN
    RAISE EXCEPTION 'staff_id is required';
  END IF;

  SELECT *
  INTO v_staff
  FROM public.clinic_staff cs
  WHERE cs.id = p_staff_id
    AND COALESCE(cs.is_active, true) = true
  LIMIT 1;

  IF v_staff.id IS NULL THEN
    RAISE EXCEPTION 'Staff member not found: %', p_staff_id;
  END IF;

  IF v_staff.user_id <> auth.uid() AND NOT public._user_can_manage_clinic(v_staff.clinic_id, auth.uid()) THEN
    RAISE EXCEPTION 'You are not allowed to resolve scope for this staff profile' USING ERRCODE = '42501';
  END IF;

  v_scope := public._resolve_queue_scope_for_user(v_staff.clinic_id, auth.uid());

  IF COALESCE((v_scope ->> 'is_owner')::BOOLEAN, false) = false
     AND (v_scope ->> 'requester_staff_id')::UUID <> p_staff_id THEN
    RAISE EXCEPTION 'You can only resolve queue scope for your own staff profile' USING ERRCODE = '42501';
  END IF;

  RETURN v_scope;
END;
$$;

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

CREATE OR REPLACE FUNCTION public.get_daily_schedule_for_clinic(
  p_clinic_id UUID,
  p_target_date DATE
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_schedule JSON;
  v_effective_mode TEXT;
  v_scope JSONB;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  v_scope := public._resolve_queue_scope_for_user(p_clinic_id, auth.uid());

  IF COALESCE(v_scope ->> 'scope_mode', 'clinic') <> 'clinic' THEN
    RAISE EXCEPTION 'You are not allowed to access clinic-wide queue scope' USING ERRCODE = '42501';
  END IF;

  v_effective_mode := public.get_effective_queue_mode(p_clinic_id, p_target_date);

  SELECT json_build_object(
    'queue_mode', v_effective_mode,
    'schedule', COALESCE(
      (
        SELECT json_agg(
          json_build_object(
            'id', a.id,
            'clinic_id', a.clinic_id,
            'patient_id', a.patient_id,
            'staff_id', a.staff_id,
            'scheduled_time', a.scheduled_time,
            'time_slot', a.time_slot,
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
            'prediction_confidence', a.prediction_confidence,
            'predicted_start_time', a.predicted_start_time,
            'last_prediction_update', a.last_prediction_update,
            'priority_score', a.priority_score,
            'is_gap_filler', a.is_gap_filler,
            'created_at', a.created_at,
            'updated_at', a.updated_at,
            'original_queue_position', a.original_queue_position,
            'skip_count', a.skip_count,
            'skip_reason', a.skip_reason,
            'override_by', a.override_by,
            'is_walk_in', a.is_walk_in,
            'resource_id', a.resource_id,
            'resource', (
              SELECT json_build_object(
                'id', cr.id,
                'name', cr.name,
                'resource_type', cr.resource_type
              )
              FROM public.clinic_resources cr
              WHERE cr.id = a.resource_id
            ),
            'patient', (
              SELECT json_build_object(
                'id', p.id,
                'display_name', p.display_name
              )
              FROM public.patients p
              WHERE p.id = a.patient_id
            ),
            'clinic', (
              SELECT json_build_object(
                'id', c.id,
                'name', c.name,
                'specialty', c.specialty,
                'city', c.city,
                'address', c.address,
                'phone', c.phone
              )
              FROM public.clinics c
              WHERE c.id = a.clinic_id
            )
          )
          ORDER BY
            a.queue_position NULLS LAST,
            COALESCE(a.scheduled_time, '00:00') ASC,
            a.created_at ASC
        )
        FROM public.appointments a
        WHERE a.clinic_id = p_clinic_id
          AND a.appointment_date = p_target_date
          AND a.status IN ('scheduled', 'waiting', 'in_progress', 'completed')
      ),
      '[]'::JSON
    )
  ) INTO v_schedule;

  RETURN v_schedule;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_daily_schedule_for_staff(
  p_staff_id UUID,
  p_target_date TEXT
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_schedule JSON;
  v_clinic_id UUID;
  v_effective_mode TEXT;
  v_target_date DATE;
  v_scope JSONB;
  v_scope_mode TEXT;
  v_allowed_staff_ids UUID[] := ARRAY[]::UUID[];
BEGIN
  SELECT cs.clinic_id
  INTO v_clinic_id
  FROM public.clinic_staff cs
  WHERE cs.id = p_staff_id
    AND COALESCE(cs.is_active, true) = true
  LIMIT 1;

  IF v_clinic_id IS NULL THEN
    RAISE EXCEPTION 'Staff member not found: %', p_staff_id;
  END IF;

  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  v_scope := public._resolve_queue_scope_for_user(v_clinic_id, auth.uid());
  v_scope_mode := COALESCE(v_scope ->> 'scope_mode', 'clinic');

  IF v_scope_mode <> 'clinic' THEN
    SELECT COALESCE(array_agg(scope_staff_id::UUID), ARRAY[]::UUID[])
    INTO v_allowed_staff_ids
    FROM jsonb_array_elements_text(COALESCE(v_scope -> 'allowed_staff_ids', '[]'::jsonb)) AS scope_staff_id;

    IF NOT (p_staff_id = ANY(v_allowed_staff_ids)) THEN
      RAISE EXCEPTION 'You are not allowed to access this provider queue' USING ERRCODE = '42501';
    END IF;
  END IF;

  v_target_date := p_target_date::DATE;
  v_effective_mode := public.get_effective_queue_mode(v_clinic_id, v_target_date);

  SELECT json_build_object(
    'queue_mode', v_effective_mode,
    'schedule', COALESCE(
      (
        SELECT json_agg(
          json_build_object(
            'id', a.id,
            'clinic_id', a.clinic_id,
            'patient_id', a.patient_id,
            'staff_id', a.staff_id,
            'scheduled_time', a.scheduled_time,
            'time_slot', a.time_slot,
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
            'prediction_confidence', a.prediction_confidence,
            'predicted_start_time', a.predicted_start_time,
            'last_prediction_update', a.last_prediction_update,
            'priority_score', a.priority_score,
            'is_gap_filler', a.is_gap_filler,
            'created_at', a.created_at,
            'updated_at', a.updated_at,
            'original_queue_position', a.original_queue_position,
            'skip_count', a.skip_count,
            'skip_reason', a.skip_reason,
            'override_by', a.override_by,
            'is_walk_in', a.is_walk_in,
            'resource_id', a.resource_id,
            'resource', (
              SELECT json_build_object(
                'id', cr.id,
                'name', cr.name,
                'resource_type', cr.resource_type
              )
              FROM public.clinic_resources cr
              WHERE cr.id = a.resource_id
            ),
            'patient', (
              SELECT json_build_object(
                'id', p.id,
                'display_name', p.display_name
              )
              FROM public.patients p
              WHERE p.id = a.patient_id
            ),
            'clinic', (
              SELECT json_build_object(
                'id', c.id,
                'name', c.name,
                'specialty', c.specialty,
                'city', c.city,
                'address', c.address,
                'phone', c.phone
              )
              FROM public.clinics c
              WHERE c.id = a.clinic_id
            )
          )
          ORDER BY
            a.queue_position NULLS LAST,
            COALESCE(a.scheduled_time, '00:00') ASC,
            a.created_at ASC
        )
        FROM public.appointments a
        WHERE a.clinic_id = v_clinic_id
          AND a.staff_id = p_staff_id
          AND a.appointment_date = v_target_date
          AND a.status IN ('scheduled', 'waiting', 'in_progress', 'completed')
      ),
      '[]'::JSON
    )
  ) INTO v_schedule;

  RETURN v_schedule;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_daily_schedule_for_doctors(
  p_clinic_id UUID,
  p_target_date DATE,
  p_staff_ids UUID[]
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_schedule JSON;
  v_effective_mode TEXT;
  v_scope JSONB;
  v_scope_mode TEXT;
  v_allowed_staff_ids UUID[] := ARRAY[]::UUID[];
  v_requested_staff_ids UUID[] := ARRAY[]::UUID[];
  v_requested_count INTEGER := 0;
  v_valid_requested_count INTEGER := 0;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  IF p_clinic_id IS NULL OR p_target_date IS NULL THEN
    RAISE EXCEPTION 'clinic_id and target_date are required';
  END IF;

  v_scope := public._resolve_queue_scope_for_user(p_clinic_id, auth.uid());
  v_scope_mode := COALESCE(v_scope ->> 'scope_mode', 'clinic');

  SELECT COALESCE(array_agg(DISTINCT requested_staff_id), ARRAY[]::UUID[])
  INTO v_requested_staff_ids
  FROM unnest(COALESCE(p_staff_ids, ARRAY[]::UUID[])) AS requested_staff_id;

  SELECT COUNT(*)
  INTO v_requested_count
  FROM unnest(v_requested_staff_ids) AS requested_staff_id;

  IF v_requested_count = 0 THEN
    v_effective_mode := public.get_effective_queue_mode(p_clinic_id, p_target_date);
    RETURN json_build_object('queue_mode', v_effective_mode, 'schedule', '[]'::JSON);
  END IF;

  SELECT COUNT(DISTINCT cs.id)
  INTO v_valid_requested_count
  FROM public.clinic_staff cs
  WHERE cs.clinic_id = p_clinic_id
    AND COALESCE(cs.is_active, true) = true
    AND cs.id = ANY(v_requested_staff_ids);

  IF v_valid_requested_count <> v_requested_count THEN
    RAISE EXCEPTION 'One or more requested staff ids are invalid for this clinic';
  END IF;

  IF v_scope_mode <> 'clinic' THEN
    SELECT COALESCE(array_agg(scope_staff_id::UUID), ARRAY[]::UUID[])
    INTO v_allowed_staff_ids
    FROM jsonb_array_elements_text(COALESCE(v_scope -> 'allowed_staff_ids', '[]'::jsonb)) AS scope_staff_id;

    IF EXISTS (
      SELECT 1
      FROM unnest(v_requested_staff_ids) AS requested_staff_id
      WHERE NOT (requested_staff_id = ANY(v_allowed_staff_ids))
    ) THEN
      RAISE EXCEPTION 'Requested provider queue is outside your allowed scope' USING ERRCODE = '42501';
    END IF;
  END IF;

  v_effective_mode := public.get_effective_queue_mode(p_clinic_id, p_target_date);

  SELECT json_build_object(
    'queue_mode', v_effective_mode,
    'schedule', COALESCE(
      (
        SELECT json_agg(
          json_build_object(
            'id', a.id,
            'clinic_id', a.clinic_id,
            'patient_id', a.patient_id,
            'staff_id', a.staff_id,
            'scheduled_time', a.scheduled_time,
            'time_slot', a.time_slot,
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
            'prediction_confidence', a.prediction_confidence,
            'predicted_start_time', a.predicted_start_time,
            'last_prediction_update', a.last_prediction_update,
            'priority_score', a.priority_score,
            'is_gap_filler', a.is_gap_filler,
            'created_at', a.created_at,
            'updated_at', a.updated_at,
            'original_queue_position', a.original_queue_position,
            'skip_count', a.skip_count,
            'skip_reason', a.skip_reason,
            'override_by', a.override_by,
            'is_walk_in', a.is_walk_in,
            'resource_id', a.resource_id,
            'resource', (
              SELECT json_build_object(
                'id', cr.id,
                'name', cr.name,
                'resource_type', cr.resource_type
              )
              FROM public.clinic_resources cr
              WHERE cr.id = a.resource_id
            ),
            'patient', (
              SELECT json_build_object(
                'id', p.id,
                'display_name', p.display_name
              )
              FROM public.patients p
              WHERE p.id = a.patient_id
            ),
            'clinic', (
              SELECT json_build_object(
                'id', c.id,
                'name', c.name,
                'specialty', c.specialty,
                'city', c.city,
                'address', c.address,
                'phone', c.phone
              )
              FROM public.clinics c
              WHERE c.id = a.clinic_id
            )
          )
          ORDER BY
            a.queue_position NULLS LAST,
            COALESCE(a.scheduled_time, '00:00') ASC,
            a.created_at ASC
        )
        FROM public.appointments a
        WHERE a.clinic_id = p_clinic_id
          AND a.staff_id = ANY(v_requested_staff_ids)
          AND a.appointment_date = p_target_date
          AND a.status IN ('scheduled', 'waiting', 'in_progress', 'completed')
      ),
      '[]'::JSON
    )
  ) INTO v_schedule;

  RETURN v_schedule;
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

  IF NOT public._user_can_manage_appointment_with_scope(v_appointment.id, auth.uid()) THEN
    RAISE EXCEPTION 'You are not allowed to manage this provider queue' USING ERRCODE = '42501';
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

GRANT EXECUTE ON FUNCTION public.resolve_queue_scope_for_staff(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.replace_staff_queue_assignments(UUID, UUID[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_daily_schedule_for_doctors(UUID, DATE, UUID[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_daily_schedule_for_clinic(UUID, DATE) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_daily_schedule_for_staff(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.assign_resource_and_call_patient(UUID, UUID, UUID) TO authenticated;

REVOKE EXECUTE ON FUNCTION public._is_staff_provider_role(UUID, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public._validate_staff_queue_assignment() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public._resolve_queue_scope_for_user(UUID, UUID) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public._user_can_manage_appointment_with_scope(UUID, UUID) FROM PUBLIC, anon, authenticated;
