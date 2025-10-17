-- Test the fixed update_patient_history() function
-- This should now work without the "no unique constraint" error

BEGIN;

-- Attempt to complete the guest appointment
UPDATE appointments
SET status = 'completed'
WHERE id = '669cbf83-0581-4174-9154-a4a5c2a70df6';

-- Check if the history was updated
SELECT 
    pch.*,
    gp.full_name,
    gp.phone_number
FROM patient_clinic_history pch
LEFT JOIN guest_patients gp ON pch.guest_patient_id = gp.id
WHERE pch.guest_patient_id = 'eb4b4fbb-be22-472c-aab3-93b1e39df7d3';

ROLLBACK;
