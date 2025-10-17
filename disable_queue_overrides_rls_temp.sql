-- Temporary workaround: Disable RLS on queue_overrides to test
-- This will allow us to confirm if RLS is the issue

ALTER TABLE queue_overrides DISABLE ROW LEVEL SECURITY;

-- Verify
SELECT 
    tablename,
    rowsecurity as rls_enabled
FROM pg_tables
WHERE tablename = 'queue_overrides';
