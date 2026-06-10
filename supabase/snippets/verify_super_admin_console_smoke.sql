-- Super-admin console RPC smoke verification.
-- Validates:
-- 1) list/search RPC access for super admins.
-- 2) grant/revoke super-admin role mutations.
-- 3) last-super-admin revoke guardrail.
--
-- Usage:
--   Get-Content -Raw "supabase/snippets/verify_super_admin_console_smoke.sql" |
--     docker exec -i supabase_db_salam-queue-flow psql -v ON_ERROR_STOP=1 -U postgres -d postgres
--
-- Non-destructive: fixture writes are wrapped in a transaction and rolled back.

\set ON_ERROR_STOP on

BEGIN;

DO $$
DECLARE
  v_admin_user UUID := gen_random_uuid();
  v_target_user UUID := gen_random_uuid();
  v_non_admin_user UUID := gen_random_uuid();
  v_list_count INT;
  v_search_count INT;
  v_result JSONB;
BEGIN
  INSERT INTO auth.users (id)
  VALUES
    (v_admin_user),
    (v_target_user),
    (v_non_admin_user)
  ON CONFLICT (id) DO NOTHING;

  UPDATE public.profiles
  SET full_name = 'Super Admin Seed', email = 'seed.super.admin@example.com'
  WHERE id = v_admin_user;

  UPDATE public.profiles
  SET full_name = 'Super Admin Target', email = 'target.super.admin@example.com'
  WHERE id = v_target_user;

  UPDATE public.profiles
  SET full_name = 'Not Super Admin', email = 'non.admin@example.com'
  WHERE id = v_non_admin_user;

  INSERT INTO public.user_roles (user_id, role, clinic_id)
  VALUES (v_admin_user, 'super_admin', NULL)
  ON CONFLICT DO NOTHING;

  PERFORM set_config('request.jwt.claim.role', 'authenticated', false);
  PERFORM set_config('request.jwt.claim.sub', v_admin_user::TEXT, false);

  SELECT COUNT(*)
  INTO v_list_count
  FROM public.list_super_admin_users();

  IF v_list_count < 1 THEN
    RAISE EXCEPTION 'Expected at least one super-admin row from list_super_admin_users';
  END IF;

  SELECT COUNT(*)
  INTO v_search_count
  FROM public.search_super_admin_candidates('target.super.admin@example.com', 20);

  IF v_search_count < 1 THEN
    RAISE EXCEPTION 'Expected search_super_admin_candidates to find target user';
  END IF;

  SELECT public.grant_super_admin_role(v_target_user)
  INTO v_result;

  IF COALESCE((v_result ->> 'success')::BOOLEAN, false) = false THEN
    RAISE EXCEPTION 'Expected grant_super_admin_role success payload, got %', v_result;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    WHERE ur.user_id = v_target_user
      AND ur.role = 'super_admin'
  ) THEN
    RAISE EXCEPTION 'Expected target user to have super_admin role after grant';
  END IF;

  SELECT public.revoke_super_admin_role(v_target_user)
  INTO v_result;

  IF COALESCE((v_result ->> 'success')::BOOLEAN, false) = false THEN
    RAISE EXCEPTION 'Expected revoke_super_admin_role success payload, got %', v_result;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.user_roles ur
    WHERE ur.user_id = v_target_user
      AND ur.role = 'super_admin'
  ) THEN
    RAISE EXCEPTION 'Expected target super_admin role to be removed after revoke';
  END IF;

  BEGIN
    PERFORM public.revoke_super_admin_role(v_admin_user);
    RAISE EXCEPTION 'Expected last-super-admin revoke guard to block removal';
  EXCEPTION
    WHEN SQLSTATE '42501' THEN
      NULL;
  END;

  PERFORM set_config('request.jwt.claim.sub', v_non_admin_user::TEXT, false);

  BEGIN
    PERFORM public.list_super_admin_users();
    RAISE EXCEPTION 'Expected non-super-admin to be denied list_super_admin_users';
  EXCEPTION
    WHEN SQLSTATE '42501' THEN
      NULL;
  END;

  RAISE NOTICE 'PASS super-admin console smoke';
END
$$;

ROLLBACK;
