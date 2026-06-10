-- =====================================================
-- Phase 49H: Role enforcement hardening + role-change audit trail.
-- Covers gaps #17/#18/#20 and partially #21.
-- =====================================================

-- -----------------------------------------------------
-- 1) Reduce user_roles drift for clinic membership rows.
-- -----------------------------------------------------

WITH ranked AS (
  SELECT
    ur.id,
    ROW_NUMBER() OVER (
      PARTITION BY ur.user_id, ur.clinic_id, ur.role
      ORDER BY ur.created_at ASC NULLS LAST, ur.id ASC
    ) AS rn
  FROM public.user_roles ur
  WHERE ur.clinic_id IS NOT NULL
)
DELETE FROM public.user_roles ur
USING ranked
WHERE ur.id = ranked.id
  AND ranked.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS idx_user_roles_unique_user_clinic_role
  ON public.user_roles(user_id, clinic_id, role)
  WHERE clinic_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public._sync_user_roles_with_clinic_staff()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    IF NEW.user_id IS NOT NULL
      AND NEW.clinic_id IS NOT NULL
      AND COALESCE(NEW.is_active, true) = true
    THEN
      INSERT INTO public.user_roles (user_id, role, clinic_id)
      VALUES (NEW.user_id, 'staff'::public.app_role, NEW.clinic_id)
      ON CONFLICT (user_id, clinic_id, role) WHERE clinic_id IS NOT NULL
      DO NOTHING;
    END IF;
  END IF;

  IF TG_OP = 'DELETE'
     OR (
       TG_OP = 'UPDATE'
       AND (
         OLD.user_id IS DISTINCT FROM NEW.user_id
         OR OLD.clinic_id IS DISTINCT FROM NEW.clinic_id
         OR (
           COALESCE(OLD.is_active, true) = true
           AND COALESCE(NEW.is_active, true) = false
         )
       )
     )
  THEN
    IF OLD.user_id IS NOT NULL AND OLD.clinic_id IS NOT NULL THEN
      IF NOT EXISTS (
        SELECT 1
        FROM public.clinic_staff cs
        WHERE cs.user_id = OLD.user_id
          AND cs.clinic_id = OLD.clinic_id
          AND COALESCE(cs.is_active, true) = true
          AND (TG_OP <> 'UPDATE' OR cs.id <> NEW.id)
      ) THEN
        DELETE FROM public.user_roles ur
        WHERE ur.user_id = OLD.user_id
          AND ur.clinic_id = OLD.clinic_id
          AND ur.role = 'staff'::public.app_role;
      END IF;
    END IF;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS sync_user_roles_with_clinic_staff ON public.clinic_staff;
CREATE TRIGGER sync_user_roles_with_clinic_staff
  AFTER INSERT OR UPDATE OR DELETE
  ON public.clinic_staff
  FOR EACH ROW
  EXECUTE FUNCTION public._sync_user_roles_with_clinic_staff();

-- -----------------------------------------------------
-- 2) Role-change audit logs.
-- -----------------------------------------------------

CREATE OR REPLACE FUNCTION public._resolve_audit_actor_user_id()
RETURNS UUID
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor UUID;
  v_claim_sub TEXT;
BEGIN
  v_actor := auth.uid();
  IF v_actor IS NOT NULL THEN
    RETURN v_actor;
  END IF;

  v_claim_sub := current_setting('request.jwt.claim.sub', true);
  IF v_claim_sub IS NULL OR btrim(v_claim_sub) = '' THEN
    RETURN NULL;
  END IF;

  BEGIN
    v_actor := v_claim_sub::UUID;
  EXCEPTION
    WHEN OTHERS THEN
      v_actor := NULL;
  END;

  RETURN v_actor;
END;
$$;

CREATE OR REPLACE FUNCTION public._audit_user_roles_changes()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor UUID := public._resolve_audit_actor_user_id();
  v_action TEXT;
  v_clinic_id UUID;
  v_entity_id UUID;
  v_target_user_id UUID;
  v_old_role TEXT;
  v_new_role TEXT;
BEGIN
  IF TG_OP = 'UPDATE'
     AND OLD.role IS NOT DISTINCT FROM NEW.role
     AND OLD.user_id IS NOT DISTINCT FROM NEW.user_id
     AND OLD.clinic_id IS NOT DISTINCT FROM NEW.clinic_id
  THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    v_action := 'user_role_assigned';
    v_clinic_id := NEW.clinic_id;
    v_entity_id := NEW.id;
    v_target_user_id := NEW.user_id;
    v_old_role := NULL;
    v_new_role := NEW.role::TEXT;
  ELSIF TG_OP = 'UPDATE' THEN
    v_action := 'user_role_updated';
    v_clinic_id := COALESCE(NEW.clinic_id, OLD.clinic_id);
    v_entity_id := COALESCE(NEW.id, OLD.id);
    v_target_user_id := COALESCE(NEW.user_id, OLD.user_id);
    v_old_role := OLD.role::TEXT;
    v_new_role := NEW.role::TEXT;
  ELSE
    v_action := 'user_role_revoked';
    v_clinic_id := OLD.clinic_id;
    v_entity_id := OLD.id;
    v_target_user_id := OLD.user_id;
    v_old_role := OLD.role::TEXT;
    v_new_role := NULL;
  END IF;

  INSERT INTO public.audit_logs (
    user_id,
    clinic_id,
    entity_type,
    entity_id,
    action,
    changes
  )
  VALUES (
    v_actor,
    v_clinic_id,
    'user_role',
    v_entity_id,
    v_action,
    jsonb_build_object(
      'table', 'user_roles',
      'target_user_id', v_target_user_id,
      'old_role', v_old_role,
      'new_role', v_new_role,
      'old_clinic_id', CASE WHEN TG_OP IN ('UPDATE', 'DELETE') THEN OLD.clinic_id ELSE NULL END,
      'new_clinic_id', CASE WHEN TG_OP IN ('INSERT', 'UPDATE') THEN NEW.clinic_id ELSE NULL END
    )
  );

  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE OR REPLACE FUNCTION public._audit_clinic_staff_role_changes()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor UUID := public._resolve_audit_actor_user_id();
  v_action TEXT;
  v_entity_id UUID;
  v_clinic_id UUID;
BEGIN
  IF TG_OP = 'UPDATE'
     AND OLD.role IS NOT DISTINCT FROM NEW.role
     AND OLD.is_active IS NOT DISTINCT FROM NEW.is_active
     AND OLD.user_id IS NOT DISTINCT FROM NEW.user_id
     AND OLD.clinic_id IS NOT DISTINCT FROM NEW.clinic_id
  THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    v_action := 'clinic_staff_added';
    v_entity_id := NEW.id;
    v_clinic_id := NEW.clinic_id;
  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.role IS DISTINCT FROM NEW.role THEN
      v_action := 'clinic_staff_role_updated';
    ELSIF OLD.is_active IS DISTINCT FROM NEW.is_active THEN
      v_action := 'clinic_staff_status_updated';
    ELSE
      v_action := 'clinic_staff_updated';
    END IF;

    v_entity_id := NEW.id;
    v_clinic_id := NEW.clinic_id;
  ELSE
    v_action := 'clinic_staff_removed';
    v_entity_id := OLD.id;
    v_clinic_id := OLD.clinic_id;
  END IF;

  INSERT INTO public.audit_logs (
    user_id,
    clinic_id,
    entity_type,
    entity_id,
    action,
    changes
  )
  VALUES (
    v_actor,
    v_clinic_id,
    'clinic_staff_role',
    v_entity_id,
    v_action,
    jsonb_build_object(
      'table', 'clinic_staff',
      'target_user_id', CASE WHEN TG_OP IN ('INSERT', 'UPDATE') THEN NEW.user_id ELSE OLD.user_id END,
      'old_role', CASE WHEN TG_OP IN ('UPDATE', 'DELETE') THEN OLD.role ELSE NULL END,
      'new_role', CASE WHEN TG_OP IN ('INSERT', 'UPDATE') THEN NEW.role ELSE NULL END,
      'old_is_active', CASE WHEN TG_OP IN ('UPDATE', 'DELETE') THEN OLD.is_active ELSE NULL END,
      'new_is_active', CASE WHEN TG_OP IN ('INSERT', 'UPDATE') THEN NEW.is_active ELSE NULL END
    )
  );

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS audit_user_roles_changes ON public.user_roles;
CREATE TRIGGER audit_user_roles_changes
  AFTER INSERT OR UPDATE OR DELETE
  ON public.user_roles
  FOR EACH ROW
  EXECUTE FUNCTION public._audit_user_roles_changes();

DROP TRIGGER IF EXISTS audit_clinic_staff_role_changes ON public.clinic_staff;
CREATE TRIGGER audit_clinic_staff_role_changes
  AFTER INSERT OR UPDATE OR DELETE
  ON public.clinic_staff
  FOR EACH ROW
  EXECUTE FUNCTION public._audit_clinic_staff_role_changes();

DROP POLICY IF EXISTS "Role managers can view clinic audit logs" ON public.audit_logs;
CREATE POLICY "Role managers can view clinic audit logs"
  ON public.audit_logs
  FOR SELECT
  USING (
    (
      clinic_id IS NOT NULL
      AND public._user_has_clinic_permission(clinic_id, auth.uid(), 'manage_roles')
    )
    OR EXISTS (
      SELECT 1
      FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role = 'super_admin'
    )
  );

-- -----------------------------------------------------
-- 3) Replace broad queue helper usage with granular checks.
-- -----------------------------------------------------

DROP POLICY IF EXISTS "Staff can view queue assignments" ON public.staff_queue_assignments;
CREATE POLICY "Staff can view queue assignments"
  ON public.staff_queue_assignments
  FOR SELECT
  USING (public._user_has_clinic_permission(clinic_id, auth.uid(), 'manage_team'));

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
  v_is_super_admin BOOLEAN := false;
  v_requester_staff_id UUID;
  v_requester_role TEXT;
  v_is_provider BOOLEAN := false;
  v_assigned_staff_ids UUID[] := ARRAY[]::UUID[];
  v_has_queue_access BOOLEAN := false;
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

  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    WHERE ur.user_id = p_user_id
      AND ur.clinic_id = p_clinic_id
      AND ur.role = 'super_admin'
  )
  INTO v_is_super_admin;

  v_has_queue_access :=
    v_is_owner
    OR v_is_super_admin
    OR public._user_has_clinic_permission(p_clinic_id, p_user_id, 'view_queue')
    OR public._user_has_clinic_permission(p_clinic_id, p_user_id, 'manage_queue')
    OR public._user_has_clinic_permission(p_clinic_id, p_user_id, 'manage_appointments');

  IF NOT v_has_queue_access THEN
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
      'is_owner', (v_is_owner OR v_is_super_admin),
      'is_provider', false,
      'allowed_staff_ids', '[]'::jsonb
    );
  END IF;

  v_is_provider := public._is_staff_provider_role(p_clinic_id, v_requester_role);

  IF NOT (v_is_owner OR v_is_super_admin) AND v_is_provider THEN
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

  IF NOT (v_is_owner OR v_is_super_admin) AND COALESCE(array_length(v_assigned_staff_ids, 1), 0) > 0 THEN
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
    'is_owner', (v_is_owner OR v_is_super_admin),
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
  v_is_super_admin BOOLEAN := false;
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

  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    WHERE ur.user_id = p_user_id
      AND ur.clinic_id = v_appointment.clinic_id
      AND ur.role = 'super_admin'
  )
  INTO v_is_super_admin;

  IF v_is_super_admin THEN
    RETURN true;
  END IF;

  IF NOT (
    public._user_has_clinic_permission(v_appointment.clinic_id, p_user_id, 'manage_queue')
    OR public._user_has_clinic_permission(v_appointment.clinic_id, p_user_id, 'manage_appointments')
  ) THEN
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
  v_can_manage_team BOOLEAN := false;
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

  v_can_manage_team := public._user_has_clinic_permission(v_staff.clinic_id, auth.uid(), 'manage_team');

  IF v_staff.user_id <> auth.uid() AND NOT v_can_manage_team THEN
    RAISE EXCEPTION 'You are not allowed to resolve scope for this staff profile' USING ERRCODE = '42501';
  END IF;

  v_scope := public._resolve_queue_scope_for_user(v_staff.clinic_id, auth.uid());

  IF NOT v_can_manage_team
     AND (v_scope ->> 'requester_staff_id')::UUID <> p_staff_id
  THEN
    RAISE EXCEPTION 'You can only resolve queue scope for your own staff profile' USING ERRCODE = '42501';
  END IF;

  RETURN v_scope;
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

  IF NOT public._user_has_clinic_permission(v_appointment.clinic_id, auth.uid(), 'manage_queue') THEN
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

  IF NOT (
    public._user_has_clinic_permission(p_clinic_id, auth.uid(), 'view_queue')
    OR public._user_has_clinic_permission(p_clinic_id, auth.uid(), 'manage_queue')
  ) THEN
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

-- -----------------------------------------------------
-- 4) Replace broad medical access helper usage.
-- -----------------------------------------------------

CREATE OR REPLACE FUNCTION public.claim_medical_record_otp_for_delivery(
  p_grant_id UUID,
  p_requester_user_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_grant public.medical_record_access_grants%ROWTYPE;
  v_appointment public.appointments%ROWTYPE;
  v_resolved RECORD;
  v_recent_count INTEGER;
  v_recent_otp public.medical_record_otp_codes%ROWTYPE;
  v_otp_id UUID;
  v_otp_plaintext TEXT;
  v_code_salt BYTEA;
  v_code_key_version TEXT := 'v1';
  v_hmac_secret TEXT;
  v_code_hmac TEXT;
BEGIN
  PERFORM public._medical_assert_service_role();

  IF p_grant_id IS NULL OR p_requester_user_id IS NULL THEN
    RAISE EXCEPTION 'grant_id and requester_user_id are required';
  END IF;

  SELECT * INTO v_grant
  FROM public.medical_record_access_grants g
  WHERE g.id = p_grant_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Grant not found';
  END IF;

  IF v_grant.status <> 'pending_otp' THEN
    RAISE EXCEPTION 'Grant is not pending OTP';
  END IF;

  IF v_grant.grantee_user_id <> p_requester_user_id THEN
    RAISE EXCEPTION 'Requester is not the grant grantee' USING ERRCODE = '42501';
  END IF;

  IF NOT public._user_has_clinic_permission(v_grant.clinic_id, p_requester_user_id, 'manage_medical_records') THEN
    RAISE EXCEPTION 'Requester cannot manage medical records for this clinic' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_appointment
  FROM public.appointments a
  WHERE a.id = v_grant.appointment_id;

  IF NOT FOUND OR v_appointment.status <> 'in_progress' THEN
    RAISE EXCEPTION 'Appointment context is not in progress';
  END IF;

  SELECT * INTO v_resolved
  FROM public._medical_resolve_delivery_channel(v_grant.patient_id)
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No contact channel available';
  END IF;

  SELECT * INTO v_recent_otp
  FROM public.medical_record_otp_codes o
  WHERE o.grant_id = v_grant.id
    AND NOT o.is_used
    AND o.expires_at > NOW()
  ORDER BY o.created_at DESC
  LIMIT 1
  FOR UPDATE;

  IF FOUND THEN
    IF v_recent_otp.delivery_status = 'sending' AND v_recent_otp.created_at > NOW() - INTERVAL '20 seconds' THEN
      RAISE EXCEPTION 'Delivery already in progress';
    END IF;

    IF v_recent_otp.delivery_status IN ('sent', 'delivered') AND v_recent_otp.created_at > NOW() - INTERVAL '30 seconds' THEN
      RAISE EXCEPTION 'OTP resend cooldown active';
    END IF;
  END IF;

  SELECT COUNT(*) INTO v_recent_count
  FROM public.medical_record_otp_codes o
  WHERE o.requesting_user_id = p_requester_user_id
    AND o.patient_id = v_grant.patient_id
    AND o.created_at > NOW() - INTERVAL '15 minutes';

  IF v_recent_count >= 3 THEN
    RAISE EXCEPTION 'Rate limit exceeded. Maximum 3 requests per 15 minutes for this patient.'
      USING ERRCODE = 'P0429';
  END IF;

  v_hmac_secret := current_setting('app.settings.medical_otp_hmac_key_v1', true);
  IF v_hmac_secret IS NULL OR v_hmac_secret = '' THEN
    RAISE EXCEPTION 'Medical OTP HMAC secret is not configured';
  END IF;

  v_otp_plaintext := lpad((floor(random() * 900000) + 100000)::int::text, 6, '0');
  v_code_salt := gen_random_bytes(16);
  v_code_hmac := encode(
    hmac(v_otp_plaintext || ':' || encode(v_code_salt, 'hex'), v_hmac_secret, 'sha256'),
    'hex'
  );

  INSERT INTO public.medical_record_otp_codes (
    grant_id,
    code_hmac,
    code_salt,
    code_key_version,
    delivery_channel,
    delivered_to_encrypted,
    delivery_status,
    delivery_attempt_count,
    last_delivery_attempt_at,
    expires_at,
    requesting_user_id,
    patient_id
  ) VALUES (
    v_grant.id,
    v_code_hmac,
    v_code_salt,
    v_code_key_version,
    v_resolved.delivery_channel,
    public.encrypt_patient_pii(v_resolved.recipient_contact),
    'sending',
    1,
    NOW(),
    NOW() + INTERVAL '5 minutes',
    p_requester_user_id,
    v_grant.patient_id
  )
  RETURNING id INTO v_otp_id;

  RETURN jsonb_build_object(
    'otp_id', v_otp_id,
    'otp_plaintext', v_otp_plaintext,
    'delivery_channel', v_resolved.delivery_channel,
    'recipient_contact', v_resolved.recipient_contact
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.request_medical_record_access(
  p_patient_id UUID,
  p_appointment_id UUID,
  p_clinic_id UUID,
  p_owner_override_reason TEXT,
  p_scope JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_patient public.patients%ROWTYPE;
  v_appointment public.appointments%ROWTYPE;
  v_staff_user_id UUID;
  v_is_assigned_doctor BOOLEAN;
  v_is_owner BOOLEAN;
  v_active_grant public.medical_record_access_grants%ROWTYPE;
  v_pending_grant public.medical_record_access_grants%ROWTYPE;
  v_grant public.medical_record_access_grants%ROWTYPE;
  v_resolved RECORD;
  v_scope JSONB;
BEGIN
  v_user_id := public._medical_assert_authenticated();

  IF p_patient_id IS NULL OR p_appointment_id IS NULL OR p_clinic_id IS NULL THEN
    RAISE EXCEPTION 'patient_id, appointment_id, and clinic_id are required';
  END IF;

  IF NOT public._user_has_clinic_permission(p_clinic_id, v_user_id, 'manage_medical_records') THEN
    RAISE EXCEPTION 'You are not allowed to request access for this clinic' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_appointment
  FROM public.appointments a
  WHERE a.id = p_appointment_id
    AND a.patient_id = p_patient_id
    AND a.clinic_id = p_clinic_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Appointment context mismatch';
  END IF;

  IF v_appointment.status <> 'in_progress' THEN
    RAISE EXCEPTION 'Medical record access can only be requested during in-progress appointments';
  END IF;

  SELECT cs.user_id INTO v_staff_user_id
  FROM public.clinic_staff cs
  WHERE cs.id = v_appointment.staff_id;

  v_is_assigned_doctor := (v_staff_user_id = v_user_id);
  v_is_owner := public._medical_is_clinic_owner(v_user_id, p_clinic_id);

  IF NOT v_is_assigned_doctor THEN
    IF NOT v_is_owner OR COALESCE(btrim(p_owner_override_reason), '') = '' THEN
      RAISE EXCEPTION 'Only assigned doctor may request access unless clinic owner override reason is provided' USING ERRCODE = '42501';
    END IF;
  END IF;

  SELECT * INTO v_patient
  FROM public.patients p
  WHERE p.id = p_patient_id
    AND NOT p.is_anonymized;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Patient not found or anonymized';
  END IF;

  v_scope := public._medical_normalize_scope(p_scope, p_appointment_id);

  SELECT * INTO v_active_grant
  FROM public.medical_record_access_grants g
  WHERE g.patient_id = p_patient_id
    AND g.grantee_user_id = v_user_id
    AND g.status = 'active'
    AND g.expires_at > NOW()
    AND g.revoked_at IS NULL
  ORDER BY g.created_at DESC
  LIMIT 1;

  IF FOUND THEN
    SELECT * INTO v_resolved
    FROM public._medical_resolve_delivery_channel(p_patient_id)
    LIMIT 1;

    RETURN jsonb_build_object(
      'grant_id', v_active_grant.id,
      'delivery_channel', COALESCE(v_resolved.delivery_channel, 'sms'),
      'patient_has_app', COALESCE(v_resolved.patient_has_app, false),
      'delivery_status', 'sent',
      'otp_ttl_seconds', 300,
      'has_access', true,
      'expires_at', v_active_grant.expires_at,
      'scope', v_active_grant.scope
    );
  END IF;

  SELECT * INTO v_pending_grant
  FROM public.medical_record_access_grants g
  WHERE g.patient_id = p_patient_id
    AND g.grantee_user_id = v_user_id
    AND g.status = 'pending_otp'
  ORDER BY g.created_at DESC
  LIMIT 1;

  IF FOUND THEN
    IF v_pending_grant.created_at < NOW() - INTERVAL '30 minutes' THEN
      UPDATE public.medical_record_access_grants
      SET status = 'expired',
          updated_at = NOW()
      WHERE id = v_pending_grant.id;
      v_pending_grant := NULL;
    END IF;
  END IF;

  IF v_pending_grant.id IS NULL THEN
    INSERT INTO public.medical_record_access_grants (
      patient_id,
      grantee_user_id,
      clinic_id,
      appointment_id,
      owner_override_reason,
      status,
      scope
    ) VALUES (
      p_patient_id,
      v_user_id,
      p_clinic_id,
      p_appointment_id,
      NULLIF(btrim(p_owner_override_reason), ''),
      'pending_otp',
      v_scope
    )
    RETURNING * INTO v_grant;
  ELSE
    UPDATE public.medical_record_access_grants
    SET scope = v_scope,
        clinic_id = p_clinic_id,
        appointment_id = p_appointment_id,
        owner_override_reason = NULLIF(btrim(p_owner_override_reason), ''),
        updated_at = NOW()
    WHERE id = v_pending_grant.id
    RETURNING * INTO v_grant;
  END IF;

  SELECT * INTO v_resolved
  FROM public._medical_resolve_delivery_channel(p_patient_id)
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'error', 'no_contact_channel',
      'message', 'Patient has no phone or email on file',
      'grant_id', v_grant.id
    );
  END IF;

  PERFORM public._medical_insert_audit_log(
    v_user_id,
    p_clinic_id,
    'medical_record_grant',
    v_grant.id,
    'request',
    jsonb_build_object(
      'appointment_id', p_appointment_id,
      'patient_id', p_patient_id,
      'delivery_channel', v_resolved.delivery_channel,
      'owner_override_reason', NULLIF(btrim(p_owner_override_reason), ''),
      'scope', v_scope
    )
  );

  RETURN jsonb_build_object(
    'grant_id', v_grant.id,
    'delivery_channel', v_resolved.delivery_channel,
    'patient_has_app', v_resolved.patient_has_app,
    'delivery_status', 'pending',
    'otp_ttl_seconds', 300,
    'scope', v_grant.scope
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.revoke_walkin_access_with_token(
  p_grant_id UUID,
  p_stop_token TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_grant public.medical_record_access_grants%ROWTYPE;
  v_token_supplied BOOLEAN;
BEGIN
  v_user_id := public._medical_assert_authenticated();
  v_token_supplied := COALESCE(NULLIF(btrim(p_stop_token), ''), '') <> '';

  IF p_grant_id IS NULL THEN
    RAISE EXCEPTION 'grant_id is required';
  END IF;

  SELECT g.* INTO v_grant
  FROM public.medical_record_access_grants g
  JOIN public.patients p ON p.id = g.patient_id
  WHERE g.id = p_grant_id
    AND p.user_id IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'walkin_grant_not_found');
  END IF;

  IF NOT public._user_has_clinic_permission(v_grant.clinic_id, v_user_id, 'manage_medical_records') THEN
    RETURN jsonb_build_object('error', 'not_authorized');
  END IF;

  IF v_grant.status NOT IN ('pending_otp', 'active') THEN
    RETURN jsonb_build_object('error', 'already_finalized', 'status', v_grant.status);
  END IF;

  UPDATE public.medical_record_access_grants
  SET status = 'revoked',
      revoked_at = NOW(),
      revoked_by = v_user_id,
      revocation_reason = 'walkin_stop',
      updated_at = NOW()
  WHERE id = p_grant_id;

  PERFORM public._medical_insert_audit_log(
    v_user_id,
    v_grant.clinic_id,
    'medical_record_grant',
    p_grant_id,
    'revoke_walkin',
    jsonb_build_object(
      'mode', 'staff_authenticated',
      'token_supplied', v_token_supplied
    )
  );

  RETURN jsonb_build_object('success', true, 'revoked_grant_id', p_grant_id);
END;
$$;
