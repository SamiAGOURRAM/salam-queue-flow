-- Test if the fix works - This simulates what the web app does

BEGIN;

-- Simulate authenticated user session
SET LOCAL role = authenticated;
SET LOCAL request.jwt.claim.sub = '6b35a6de-e5de-4f6c-b544-76318b46aae8';

-- Test: Can we now UPDATE with the full SELECT including JOINs?
UPDATE appointments
SET status = 'completed'
WHERE id = '669cbf83-0581-4174-9154-a4a5c2a70df6'
RETURNING 
    id,
    status,
    patient_id,
    guest_patient_id,
    is_guest;

-- If that worked, test the full query with all JOINs (like the app does)
SELECT 
    a.*,
    patient.id as patient_profile_id,
    patient.full_name as patient_name,
    guest_patient.id as guest_id,
    guest_patient.full_name as guest_name,
    clinic.id as clinic_id,
    clinic.name as clinic_name
FROM appointments a
LEFT JOIN profiles patient ON a.patient_id = patient.id
LEFT JOIN guest_patients guest_patient ON a.guest_patient_id = guest_patient.id
LEFT JOIN clinics clinic ON a.clinic_id = clinic.id
WHERE a.id = '669cbf83-0581-4174-9154-a4a5c2a70df6';

ROLLBACK;

-- Reset
RESET role;
