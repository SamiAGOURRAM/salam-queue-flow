-- Check current RLS policies on queue_overrides table

-- 1. Check if RLS is enabled
SELECT 
    tablename,
    rowsecurity as rls_enabled
FROM pg_tables
WHERE tablename = 'queue_overrides';

-- 2. Check all policies on queue_overrides
SELECT 
    policyname,
    cmd,
    qual as using_expression,
    with_check as with_check_expression
FROM pg_policies
WHERE tablename = 'queue_overrides'
ORDER BY cmd, policyname;

-- 3. Verify user is clinic owner/staff
SELECT 
    '6b35a6de-e5de-4f6c-b544-76318b46aae8' as user_id,
    EXISTS(
        SELECT 1 FROM clinics 
        WHERE owner_id = '6b35a6de-e5de-4f6c-b544-76318b46aae8'
    ) as is_clinic_owner,
    EXISTS(
        SELECT 1 FROM clinic_staff 
        WHERE user_id = '6b35a6de-e5de-4f6c-b544-76318b46aae8'
        AND is_active = true
    ) as is_staff;
