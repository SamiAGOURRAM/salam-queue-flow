-- Re-assert the standard Supabase API-role table privileges on the public schema.
--
-- WHY: `supabase db reset` (used in CI) does NOT reapply Supabase's implicit
-- default-privilege grants to migration-created tables, so `anon` / `authenticated`
-- end up WITHOUT SELECT/INSERT/UPDATE/DELETE on core tables that were never granted
-- explicitly (e.g. `clinics`, `clinic_staff`). The booking smoke then fails at setup
-- with `permission denied for table clinics`. A normally-started local/hosted project
-- happens to have these grants from init time, which is why it only surfaces in CI.
--
-- SAFETY: every table in `public` has RLS ENABLED, so these are TABLE-level grants only —
-- actual row access stays governed by the existing RLS policies. We intentionally do NOT
-- grant EXECUTE on functions here: internal SECURITY DEFINER helpers are deliberately
-- REVOKED from anon/authenticated in other migrations, and the public-facing RPCs are
-- granted explicitly where they are defined. Sequences are needed for INSERTs.

GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;

-- Future tables (created by later migrations) inherit the same grants.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO anon, authenticated, service_role;
