-- Detailed RLS diagnostic for appointments UPDATE
-- Run each section and provide all results

-- 1. Show ALL policies on appointments (not just UPDATE)
SELECT 
    schemaname,
    tablename,
    policyname,
    permissive,
    roles,
    cmd,
    qual as using_expression,
    with_check as with_check_expression
FROM pg_policies
WHERE tablename = 'appointments'
ORDER BY cmd, policyname;

-- 2. Check if RLS is enabled on appointments
SELECT 
    schemaname,
    tablename,
    rowsecurity as rls_enabled
FROM pg_tables
WHERE tablename = 'appointments';

-- 3. Verify user's relationship with clinic
SELECT 
    '6b35a6de-e5de-4f6c-b544-76318b46aae8' as user_id,
    EXISTS(
        SELECT 1 FROM clinics 
        WHERE id = '33b67ced-ffd3-4a78-9180-d264fd089a7b' 
        AND owner_id = '6b35a6de-e5de-4f6c-b544-76318b46aae8'
    ) as is_owner,
    EXISTS(
        SELECT 1 FROM clinic_staff 
        WHERE clinic_id = '33b67ced-ffd3-4a78-9180-d264fd089a7b' 
        AND user_id = '6b35a6de-e5de-4f6c-b544-76318b46aae8'
    ) as is_staff;

-- 4. Test if user can SELECT the appointment (to verify authentication works)
-- Run this as the authenticated user via Supabase client
-- SET LOCAL role = authenticated;
-- SET LOCAL request.jwt.claim.sub = '6b35a6de-e5de-4f6c-b544-76318b46aae8';
