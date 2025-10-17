-- Test if the RLS policies actually work for this specific user and appointment
-- This simulates what happens when the web app makes the request

-- Set the session to act as the authenticated user
SET LOCAL role = authenticated;
SET LOCAL request.jwt.claim.sub = '6b35a6de-e5de-4f6c-b544-76318b46aae8';

-- Test 1: Can we SELECT the appointment?
SELECT 
    id, 
    clinic_id, 
    status,
    patient_id,
    guest_patient_id,
    is_guest
FROM appointments
WHERE id = '669cbf83-0581-4174-9154-a4a5c2a70df6';

-- Test 2: Check if the UPDATE policy conditions are met
SELECT 
    'Policy: Clinic owners can update' as policy,
    EXISTS (
        SELECT 1
        FROM clinics
        WHERE clinics.id = '33b67ced-ffd3-4a78-9180-d264fd089a7b'
        AND clinics.owner_id = '6b35a6de-e5de-4f6c-b544-76318b46aae8'
    ) as condition_met
UNION ALL
SELECT 
    'Policy: Staff can update' as policy,
    EXISTS (
        SELECT 1
        FROM clinic_staff
        WHERE clinic_staff.user_id = '6b35a6de-e5de-4f6c-b544-76318b46aae8'
        AND clinic_staff.clinic_id = '33b67ced-ffd3-4a78-9180-d264fd089a7b'
        AND clinic_staff.is_active = true
    ) as condition_met;

-- Test 3: Try to UPDATE the appointment
UPDATE appointments
SET status = 'completed'
WHERE id = '669cbf83-0581-4174-9154-a4a5c2a70df6'
RETURNING id, status;

-- Reset role
RESET role;
