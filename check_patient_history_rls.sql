-- Check RLS policies on patient_clinic_history table

-- 1. Check if RLS is enabled
SELECT 
    tablename,
    rowsecurity as rls_enabled
FROM pg_tables
WHERE tablename = 'patient_clinic_history';

-- 2. Check existing policies
SELECT 
    policyname,
    cmd,
    qual as using_expression,
    with_check as with_check_expression
FROM pg_policies
WHERE tablename = 'patient_clinic_history'
ORDER BY cmd, policyname;
