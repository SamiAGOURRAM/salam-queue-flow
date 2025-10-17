-- Check RLS policies on related tables that are JOINed in the UPDATE query

-- 1. Policies on profiles table
SELECT 
    tablename,
    policyname,
    cmd,
    qual as using_expression
FROM pg_policies
WHERE tablename = 'profiles'
AND cmd IN ('SELECT', 'ALL')
ORDER BY policyname;

-- 2. Policies on guest_patients table
SELECT 
    tablename,
    policyname,
    cmd,
    qual as using_expression
FROM pg_policies
WHERE tablename = 'guest_patients'
AND cmd IN ('SELECT', 'ALL')
ORDER BY policyname;

-- 3. Policies on clinics table
SELECT 
    tablename,
    policyname,
    cmd,
    qual as using_expression
FROM pg_policies
WHERE tablename = 'clinics'
AND cmd IN ('SELECT', 'ALL')
ORDER BY policyname;

-- 4. Check if RLS is enabled on these tables
SELECT 
    tablename,
    rowsecurity as rls_enabled
FROM pg_tables
WHERE tablename IN ('profiles', 'guest_patients', 'clinics')
ORDER BY tablename;
