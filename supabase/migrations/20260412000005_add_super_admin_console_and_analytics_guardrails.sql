-- =====================================================
-- Phase 49J: Super-admin console foundations + analytics guardrails.
-- Covers gap #22 and closes remaining server-side checks for analytics RPCs.
-- =====================================================

-- -----------------------------------------------------
-- 1) Super-admin helpers and management RPCs.
-- -----------------------------------------------------

CREATE OR REPLACE FUNCTION public._is_super_admin_user(
  p_user_id UUID DEFAULT auth.uid()
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    WHERE ur.user_id = p_user_id
      AND ur.role = 'super_admin'::public.app_role
  );
$$;

CREATE OR REPLACE FUNCTION public._assert_super_admin_user(
  p_user_id UUID DEFAULT auth.uid()
)
RETURNS UUID
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  IF NOT public._is_super_admin_user(p_user_id) THEN
    RAISE EXCEPTION 'Super admin access required' USING ERRCODE = '42501';
  END IF;

  RETURN p_user_id;
END;
$$;

WITH ranked_global_super_admin AS (
  SELECT
    ur.id,
    ROW_NUMBER() OVER (
      PARTITION BY ur.user_id
      ORDER BY ur.created_at ASC NULLS LAST, ur.id ASC
    ) AS rn
  FROM public.user_roles ur
  WHERE ur.role = 'super_admin'::public.app_role
    AND ur.clinic_id IS NULL
)
DELETE FROM public.user_roles ur
USING ranked_global_super_admin d
WHERE ur.id = d.id
  AND d.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS idx_user_roles_unique_global_super_admin
  ON public.user_roles(user_id)
  WHERE role = 'super_admin'::public.app_role
    AND clinic_id IS NULL;

CREATE OR REPLACE FUNCTION public.list_super_admin_users()
RETURNS TABLE (
  user_id UUID,
  full_name TEXT,
  email TEXT,
  first_granted_at TIMESTAMPTZ,
  has_global_role BOOLEAN,
  clinic_scoped_role_count INT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public._assert_super_admin_user(auth.uid());

  RETURN QUERY
  SELECT
    ur.user_id,
    COALESCE(NULLIF(btrim(p.full_name), ''), 'Unknown user')::TEXT AS full_name,
    p.email,
    MIN(ur.created_at) AS first_granted_at,
    BOOL_OR(ur.clinic_id IS NULL) AS has_global_role,
    COUNT(*) FILTER (WHERE ur.clinic_id IS NOT NULL)::INT AS clinic_scoped_role_count
  FROM public.user_roles ur
  LEFT JOIN public.profiles p ON p.id = ur.user_id
  WHERE ur.role = 'super_admin'::public.app_role
  GROUP BY ur.user_id, p.full_name, p.email
  ORDER BY MIN(ur.created_at) ASC, COALESCE(NULLIF(btrim(p.full_name), ''), p.email, ur.user_id::TEXT) ASC;
END;
$$;

CREATE OR REPLACE FUNCTION public.search_super_admin_candidates(
  p_query TEXT DEFAULT NULL,
  p_limit INT DEFAULT 20
)
RETURNS TABLE (
  user_id UUID,
  full_name TEXT,
  email TEXT,
  phone_number TEXT,
  is_super_admin BOOLEAN
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_query TEXT := NULLIF(btrim(COALESCE(p_query, '')), '');
  v_limit INT := LEAST(GREATEST(COALESCE(p_limit, 20), 1), 50);
BEGIN
  PERFORM public._assert_super_admin_user(auth.uid());

  RETURN QUERY
  SELECT
    p.id AS user_id,
    COALESCE(NULLIF(btrim(p.full_name), ''), 'Unknown user')::TEXT AS full_name,
    p.email,
    p.phone_number,
    EXISTS (
      SELECT 1
      FROM public.user_roles ur
      WHERE ur.user_id = p.id
        AND ur.role = 'super_admin'::public.app_role
    ) AS is_super_admin
  FROM public.profiles p
  WHERE v_query IS NULL
     OR p.id::TEXT ILIKE '%' || v_query || '%'
     OR COALESCE(p.full_name, '') ILIKE '%' || v_query || '%'
     OR COALESCE(p.email, '') ILIKE '%' || v_query || '%'
     OR COALESCE(p.phone_number, '') ILIKE '%' || v_query || '%'
  ORDER BY
    EXISTS (
      SELECT 1
      FROM public.user_roles ur
      WHERE ur.user_id = p.id
        AND ur.role = 'super_admin'::public.app_role
    ) DESC,
    COALESCE(NULLIF(btrim(p.full_name), ''), p.email, p.id::TEXT) ASC
  LIMIT v_limit;
END;
$$;

CREATE OR REPLACE FUNCTION public.grant_super_admin_role(
  p_target_user_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor UUID := public._assert_super_admin_user(auth.uid());
  v_inserted_rows INT := 0;
BEGIN
  IF p_target_user_id IS NULL THEN
    RAISE EXCEPTION 'target_user_id is required';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM auth.users u
    WHERE u.id = p_target_user_id
  ) THEN
    RAISE EXCEPTION 'Target user does not exist';
  END IF;

  INSERT INTO public.user_roles (user_id, role, clinic_id)
  VALUES (p_target_user_id, 'super_admin'::public.app_role, NULL)
  ON CONFLICT (user_id) WHERE role = 'super_admin'::public.app_role AND clinic_id IS NULL
  DO NOTHING;

  GET DIAGNOSTICS v_inserted_rows = ROW_COUNT;

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
    NULL,
    'user_role',
    p_target_user_id,
    'super_admin_granted',
    jsonb_build_object(
      'table', 'user_roles',
      'target_user_id', p_target_user_id,
      'new_role', 'super_admin',
      'global_role_inserted', (v_inserted_rows > 0)
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'target_user_id', p_target_user_id,
    'already_super_admin', (v_inserted_rows = 0)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.revoke_super_admin_role(
  p_target_user_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor UUID := public._assert_super_admin_user(auth.uid());
  v_remaining_super_admin_users INT := 0;
  v_deleted_global_rows INT := 0;
  v_deleted_clinic_rows INT := 0;
BEGIN
  IF p_target_user_id IS NULL THEN
    RAISE EXCEPTION 'target_user_id is required';
  END IF;

  SELECT COUNT(DISTINCT ur.user_id)
  INTO v_remaining_super_admin_users
  FROM public.user_roles ur
  WHERE ur.role = 'super_admin'::public.app_role
    AND ur.user_id <> p_target_user_id;

  IF v_remaining_super_admin_users = 0 THEN
    RAISE EXCEPTION 'Cannot revoke the last super admin role' USING ERRCODE = '42501';
  END IF;

  DELETE FROM public.user_roles ur
  WHERE ur.user_id = p_target_user_id
    AND ur.role = 'super_admin'::public.app_role
    AND ur.clinic_id IS NULL;

  GET DIAGNOSTICS v_deleted_global_rows = ROW_COUNT;

  DELETE FROM public.user_roles ur
  WHERE ur.user_id = p_target_user_id
    AND ur.role = 'super_admin'::public.app_role
    AND ur.clinic_id IS NOT NULL;

  GET DIAGNOSTICS v_deleted_clinic_rows = ROW_COUNT;

  IF v_deleted_global_rows = 0 AND v_deleted_clinic_rows = 0 THEN
    RETURN jsonb_build_object(
      'success', true,
      'target_user_id', p_target_user_id,
      'changed', false,
      'reason', 'target_not_super_admin'
    );
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
    NULL,
    'user_role',
    p_target_user_id,
    'super_admin_revoked',
    jsonb_build_object(
      'table', 'user_roles',
      'target_user_id', p_target_user_id,
      'old_role', 'super_admin',
      'deleted_global_rows', v_deleted_global_rows,
      'deleted_clinic_rows', v_deleted_clinic_rows
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'target_user_id', p_target_user_id,
    'changed', true,
    'deleted_global_rows', v_deleted_global_rows,
    'deleted_clinic_rows', v_deleted_clinic_rows
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public._is_super_admin_user(UUID) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public._assert_super_admin_user(UUID) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.list_super_admin_users() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.search_super_admin_candidates(TEXT, INT) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.grant_super_admin_role(UUID) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.revoke_super_admin_role(UUID) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public._is_super_admin_user(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public._assert_super_admin_user(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_super_admin_users() TO authenticated;
GRANT EXECUTE ON FUNCTION public.search_super_admin_candidates(TEXT, INT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.grant_super_admin_role(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_super_admin_role(UUID) TO authenticated;

-- -----------------------------------------------------
-- 2) Analytics guardrail: enforce view_analytics server-side.
-- -----------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_clinic_realtime_metrics(
  p_clinic_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_active_staff INT;
  v_no_show_rate NUMERIC;
  v_rolling_avg NUMERIC;
  v_total_today INT;
  v_absent_today INT;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  IF p_clinic_id IS NULL THEN
    RAISE EXCEPTION 'clinic_id is required';
  END IF;

  IF NOT public._user_has_clinic_permission(p_clinic_id, v_user_id, 'view_analytics') THEN
    RAISE EXCEPTION 'You do not have permission to view clinic analytics' USING ERRCODE = '42501';
  END IF;

  SELECT COUNT(*) INTO v_active_staff
  FROM public.clinic_staff
  WHERE clinic_id = p_clinic_id
    AND is_active = true;

  SELECT COUNT(*) INTO v_total_today
  FROM public.appointments
  WHERE clinic_id = p_clinic_id
    AND appointment_date = CURRENT_DATE;

  SELECT COUNT(*) INTO v_absent_today
  FROM public.absent_patients
  WHERE clinic_id = p_clinic_id
    AND marked_absent_at::DATE = CURRENT_DATE;

  IF v_total_today > 0 THEN
    v_no_show_rate := v_absent_today::NUMERIC / v_total_today::NUMERIC;
  ELSE
    v_no_show_rate := 0;
  END IF;

  SELECT AVG(actual_duration) INTO v_rolling_avg
  FROM (
    SELECT a.actual_duration
    FROM public.appointments a
    WHERE a.clinic_id = p_clinic_id
      AND a.status = 'completed'::public.appointment_status
      AND a.actual_duration IS NOT NULL
    ORDER BY a.actual_end_time DESC
    LIMIT 10
  ) AS recent;

  IF v_rolling_avg IS NULL THEN
    v_rolling_avg := 15;
  END IF;

  RETURN jsonb_build_object(
    'active_staff_count', v_active_staff,
    'no_show_rate_today', v_no_show_rate,
    'rolling_avg_service_duration', v_rolling_avg
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_clinic_realtime_metrics(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_clinic_realtime_metrics(UUID) TO authenticated;
