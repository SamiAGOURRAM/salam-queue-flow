-- Debug: Test the policy conditions step by step with authenticated context

BEGIN;

-- Set authenticated user context
SET LOCAL role = authenticated;
SET LOCAL request.jwt.claim.sub = '6b35a6de-e5de-4f6c-b544-76318b46aae8';

-- Test 1: Can we query clinics?
SELECT 
    'Can query clinics' as test,
    COUNT(*) as count
FROM clinics
WHERE id = '33b67ced-ffd3-4a78-9180-d264fd089a7b';

-- Test 2: Can we see the owner_id?
SELECT 
    'Can see clinic owner' as test,
    id,
    owner_id,
    owner_id = auth.uid() as is_owner
FROM clinics
WHERE id = '33b67ced-ffd3-4a78-9180-d264fd089a7b';

-- Test 3: Check auth.uid() value
SELECT 
    'Check auth.uid()' as test,
    auth.uid() as current_user_id;

-- Test 4: Can we query clinic_staff?
SELECT 
    'Can query clinic_staff' as test,
    COUNT(*) as count
FROM clinic_staff
WHERE clinic_id = '33b67ced-ffd3-4a78-9180-d264fd089a7b'
AND user_id = auth.uid();

-- Test 5: Direct condition check (what the policy uses)
SELECT 
    'Policy Condition 1: Owner check' as test,
    EXISTS (
        SELECT 1
        FROM clinics c
        WHERE c.id = '33b67ced-ffd3-4a78-9180-d264fd089a7b'
        AND c.owner_id = auth.uid()
    ) as passes;

SELECT 
    'Policy Condition 2: Staff check' as test,
    EXISTS (
        SELECT 1
        FROM clinic_staff cs
        WHERE cs.clinic_id = '33b67ced-ffd3-4a78-9180-d264fd089a7b'
        AND cs.user_id = auth.uid()
        AND cs.is_active = true
    ) as passes;

ROLLBACK;

RESET role;
