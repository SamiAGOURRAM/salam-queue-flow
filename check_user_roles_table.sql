-- Check if user_roles table exists and has data for this user

-- 1. Check if user_roles table exists
SELECT EXISTS (
    SELECT FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND table_name = 'user_roles'
) as table_exists;

-- 2. Check user_roles for this specific user
SELECT *
FROM user_roles
WHERE user_id = '6b35a6de-e5de-4f6c-b544-76318b46aae8';

-- 3. Check user_roles structure
SELECT 
    column_name,
    data_type,
    is_nullable
FROM information_schema.columns
WHERE table_name = 'user_roles'
ORDER BY ordinal_position;

-- 4. Test if the INSERT policy condition would pass
-- Simulate what happens during INSERT
SELECT 
    'Condition 1: Clinic owner via clinics.owner_id' as test,
    EXISTS (
        SELECT 1
        FROM clinics c
        JOIN profiles p ON p.id = c.owner_id
        WHERE c.id = '33b67ced-ffd3-4a78-9180-d264fd089a7b'
        AND p.id = '6b35a6de-e5de-4f6c-b544-76318b46aae8'
    ) as passes
UNION ALL
SELECT 
    'Condition 2: Staff via clinic_staff' as test,
    EXISTS (
        SELECT 1
        FROM clinic_staff
        WHERE clinic_staff.user_id = '6b35a6de-e5de-4f6c-b544-76318b46aae8'
        AND clinic_staff.clinic_id = '33b67ced-ffd3-4a78-9180-d264fd089a7b'
        AND clinic_staff.is_active = true
    ) as passes
UNION ALL
SELECT 
    'Condition 3: Via user_roles table' as test,
    EXISTS (
        SELECT 1
        FROM user_roles
        WHERE user_roles.user_id = '6b35a6de-e5de-4f6c-b544-76318b46aae8'
        AND user_roles.clinic_id = '33b67ced-ffd3-4a78-9180-d264fd089a7b'
        AND user_roles.role = ANY (ARRAY['clinic_owner'::app_role, 'staff'::app_role])
    ) as passes;
