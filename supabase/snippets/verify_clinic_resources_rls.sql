-- Verifies clinic_resources RLS behavior for clinic owner, staff, and outsider contexts.
-- Usage:
--   Get-Content "supabase/snippets/verify_clinic_resources_rls.sql" -Raw |
--     docker exec -i supabase_db_salam-queue-flow psql -v ON_ERROR_STOP=1 -U postgres -d postgres
--
-- This script is non-destructive: it runs in a transaction and ends with ROLLBACK.

\set ON_ERROR_STOP on

BEGIN;

-- ── 0. Ensure at least 3 auth.users exist (insert stubs if needed) ─────────

DO $$
DECLARE
  v_missing integer;
BEGIN
  SELECT GREATEST(0, 3 - COUNT(*)) INTO v_missing FROM auth.users;

  IF v_missing > 0 THEN
    INSERT INTO auth.users (id)
    SELECT gen_random_uuid()
    FROM generate_series(1, v_missing);
  END IF;
END;
$$;

-- ── 1. Resolve test user IDs into session-level GUCs ────────────────────────

WITH users AS (
  SELECT id, row_number() OVER (ORDER BY created_at, id) AS rn
  FROM auth.users
)
SELECT
  set_config('test.owner_user_id',    (SELECT id::text FROM users WHERE rn = 1), true),
  set_config('test.staff_user_id',    (SELECT id::text FROM users WHERE rn = 2), true),
  set_config('test.outsider_user_id', (SELECT id::text FROM users WHERE rn = 3), true);

DO $$
BEGIN
  IF current_setting('test.owner_user_id', true) IS NULL
     OR current_setting('test.owner_user_id', true) = ''
     OR current_setting('test.staff_user_id', true) IS NULL
     OR current_setting('test.staff_user_id', true) = ''
     OR current_setting('test.outsider_user_id', true) IS NULL
     OR current_setting('test.outsider_user_id', true) = ''
  THEN
    RAISE EXCEPTION 'Need at least 3 rows in auth.users to run this verification script.';
  END IF;
END;
$$;

-- ── 2. Generate fixture UUIDs ───────────────────────────────────────────────

SELECT
  set_config('test.clinic_a_id',                  gen_random_uuid()::text, true),
  set_config('test.clinic_b_id',                  gen_random_uuid()::text, true),
  set_config('test.base_resource_id',             gen_random_uuid()::text, true),
  set_config('test.owner_rpc_resource_id',        gen_random_uuid()::text, true),
  set_config('test.owner_insert_resource_id',     gen_random_uuid()::text, true),
  set_config('test.outsider_attempt_resource_id', gen_random_uuid()::text, true);

-- ── 3. Seed fixture data ────────────────────────────────────────────────────

INSERT INTO public.clinics (id, owner_id, name, specialty, address, city, phone, is_active)
VALUES
  (
    current_setting('test.clinic_a_id')::uuid,
    current_setting('test.owner_user_id')::uuid,
    'RLS Verify Clinic A', 'General Medicine', '1 Test Street', 'Rabat', '+212600000001', true
  ),
  (
    current_setting('test.clinic_b_id')::uuid,
    current_setting('test.outsider_user_id')::uuid,
    'RLS Verify Clinic B', 'General Medicine', '2 Test Street', 'Casablanca', '+212600000002', true
  );

INSERT INTO public.user_roles (user_id, role, clinic_id)
VALUES
  (current_setting('test.owner_user_id')::uuid,    'clinic_owner', current_setting('test.clinic_a_id')::uuid),
  (current_setting('test.staff_user_id')::uuid,    'staff',        current_setting('test.clinic_a_id')::uuid),
  (current_setting('test.outsider_user_id')::uuid,  'clinic_owner', current_setting('test.clinic_b_id')::uuid);

INSERT INTO public.clinic_resources (id, clinic_id, name, resource_type, capacity, is_active, display_order, notes)
VALUES (
  current_setting('test.base_resource_id')::uuid,
  current_setting('test.clinic_a_id')::uuid,
  'RLS Base Resource', 'room', 1, true, 0, 'seed for RLS checks'
);

-- ── 4. Switch to authenticated role ─────────────────────────────────────────

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.role', 'authenticated', true);

-- ── Test 1: Owner can read clinic A resources ───────────────────────────────

SELECT set_config('request.jwt.claim.sub', current_setting('test.owner_user_id'), true);

DO $$
DECLARE
  v_count integer;
BEGIN
  SELECT COUNT(*) INTO v_count
  FROM public.clinic_resources
  WHERE id = current_setting('test.base_resource_id')::uuid;

  IF v_count <> 1 THEN
    RAISE EXCEPTION 'owner_select failed: expected 1 row, got %', v_count;
  END IF;

  RAISE NOTICE 'PASS owner_select';
END;
$$;

-- ── Test 2: Staff can read clinic A resources ───────────────────────────────

SELECT set_config('request.jwt.claim.sub', current_setting('test.staff_user_id'), true);

DO $$
DECLARE
  v_count integer;
BEGIN
  SELECT COUNT(*) INTO v_count
  FROM public.clinic_resources
  WHERE id = current_setting('test.base_resource_id')::uuid;

  IF v_count <> 1 THEN
    RAISE EXCEPTION 'staff_select failed: expected 1 row, got %', v_count;
  END IF;

  RAISE NOTICE 'PASS staff_select';
END;
$$;

-- ── Test 3: Outsider cannot read clinic A resources ─────────────────────────

SELECT set_config('request.jwt.claim.sub', current_setting('test.outsider_user_id'), true);

DO $$
DECLARE
  v_count integer;
BEGIN
  SELECT COUNT(*) INTO v_count
  FROM public.clinic_resources
  WHERE id = current_setting('test.base_resource_id')::uuid;

  IF v_count <> 0 THEN
    RAISE EXCEPTION 'outsider_select failed: expected 0 rows, got %', v_count;
  END IF;

  RAISE NOTICE 'PASS outsider_select_blocked';
END;
$$;

-- ── Test 4: Owner can insert into clinic A via RPC ──────────────────────────

SELECT set_config('request.jwt.claim.sub', current_setting('test.owner_user_id'), true);

DO $$
DECLARE
  v_inserted public.clinic_resources;
BEGIN
  SELECT * INTO v_inserted
  FROM public.create_clinic_resource(
    p_clinic_id => current_setting('test.clinic_a_id')::uuid,
    p_name => 'RLS Owner RPC Insert',
    p_resource_type => 'room',
    p_capacity => 2,
    p_notes => 'owner rpc insert check',
    p_created_by => current_setting('test.owner_user_id')::uuid
  );

  IF v_inserted.id IS NULL THEN
    RAISE EXCEPTION 'owner_rpc_insert failed: function did not return a row';
  END IF;

  IF v_inserted.display_order <> 1 THEN
    RAISE EXCEPTION 'owner_rpc_insert failed: expected display_order 1, got %', v_inserted.display_order;
  END IF;

  PERFORM set_config('test.owner_rpc_resource_id', v_inserted.id::text, true);

  RAISE NOTICE 'PASS owner_rpc_insert';
END;
$$;

-- ── Test 5: Owner can insert directly into clinic A ─────────────────────────

SELECT set_config('request.jwt.claim.sub', current_setting('test.owner_user_id'), true);

INSERT INTO public.clinic_resources (id, clinic_id, name, resource_type, capacity, is_active, display_order, notes)
VALUES (
  current_setting('test.owner_insert_resource_id')::uuid,
  current_setting('test.clinic_a_id')::uuid,
  'RLS Owner Insert', 'room', 1, true, 10, 'owner insert check'
);

DO $$
DECLARE
  v_count integer;
BEGIN
  SELECT COUNT(*) INTO v_count
  FROM public.clinic_resources
  WHERE id = current_setting('test.owner_insert_resource_id')::uuid;

  IF v_count <> 1 THEN
    RAISE EXCEPTION 'owner_insert failed: expected 1 row, got %', v_count;
  END IF;

  RAISE NOTICE 'PASS owner_insert_direct';
END;
$$;

-- ── Test 6: Staff can update clinic A resource ──────────────────────────────

SELECT set_config('request.jwt.claim.sub', current_setting('test.staff_user_id'), true);

DO $$
DECLARE
  v_rows integer;
BEGIN
  UPDATE public.clinic_resources
  SET notes = 'updated-by-staff'
  WHERE id = current_setting('test.owner_insert_resource_id')::uuid;

  GET DIAGNOSTICS v_rows = ROW_COUNT;

  IF v_rows <> 1 THEN
    RAISE EXCEPTION 'staff_update failed: expected 1 updated row, got %', v_rows;
  END IF;

  RAISE NOTICE 'PASS staff_update';
END;
$$;

-- ── Test 7: Outsider RPC insert is denied ───────────────────────────────────

SELECT set_config('request.jwt.claim.sub', current_setting('test.outsider_user_id'), true);

DO $$
BEGIN
  BEGIN
    PERFORM public.create_clinic_resource(
      p_clinic_id => current_setting('test.clinic_a_id')::uuid,
      p_name => 'RLS Outsider RPC Insert Attempt',
      p_resource_type => 'room',
      p_capacity => 1,
      p_notes => NULL,
      p_created_by => current_setting('test.outsider_user_id')::uuid
    );

    RAISE EXCEPTION 'outsider_rpc_insert_denied failed: rpc insert unexpectedly succeeded';
  EXCEPTION
    WHEN insufficient_privilege THEN
      RAISE NOTICE 'PASS outsider_rpc_insert_denied';
  END;
END;
$$;

-- ── Test 8: Outsider direct insert is denied ────────────────────────────────

SELECT set_config('request.jwt.claim.sub', current_setting('test.outsider_user_id'), true);

DO $$
BEGIN
  BEGIN
    INSERT INTO public.clinic_resources (id, clinic_id, name, resource_type, capacity, is_active, display_order)
    VALUES (
      current_setting('test.outsider_attempt_resource_id')::uuid,
      current_setting('test.clinic_a_id')::uuid,
      'RLS Outsider Insert Attempt', 'room', 1, true, 99
    );

    RAISE EXCEPTION 'outsider_insert_denied failed: insert unexpectedly succeeded';
  EXCEPTION
    WHEN insufficient_privilege THEN
      RAISE NOTICE 'PASS outsider_insert_denied';
  END;
END;
$$;

    -- ── Test 9: Outsider delete is blocked (no visible target rows) ─────────────

SELECT set_config('request.jwt.claim.sub', current_setting('test.outsider_user_id'), true);

DO $$
DECLARE
  v_rows integer;
BEGIN
  DELETE FROM public.clinic_resources
  WHERE id = current_setting('test.owner_insert_resource_id')::uuid;

  GET DIAGNOSTICS v_rows = ROW_COUNT;

  IF v_rows <> 0 THEN
    RAISE EXCEPTION 'outsider_delete_blocked failed: expected 0 deleted rows, got %', v_rows;
  END IF;

  RAISE NOTICE 'PASS outsider_delete_blocked';
END;
$$;

-- ── Test 10: Owner can delete clinic A resource ─────────────────────────────

SELECT set_config('request.jwt.claim.sub', current_setting('test.owner_user_id'), true);

DO $$
DECLARE
  v_rows integer;
BEGIN
  DELETE FROM public.clinic_resources
  WHERE id = current_setting('test.owner_insert_resource_id')::uuid;

  GET DIAGNOSTICS v_rows = ROW_COUNT;

  IF v_rows <> 1 THEN
    RAISE EXCEPTION 'owner_delete failed: expected 1 deleted row, got %', v_rows;
  END IF;

  RAISE NOTICE 'PASS owner_delete';
END;
$$;

DO $$
BEGIN
  RAISE NOTICE 'All clinic_resources RLS checks passed.';
END;
$$;

ROLLBACK;
