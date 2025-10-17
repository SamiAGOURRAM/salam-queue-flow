-- Test manual update of the appointment to see exact error
BEGIN;

-- Try to update the status
UPDATE appointments 
SET 
    status = 'completed',
    updated_at = NOW()
WHERE id = '669cbf83-0581-4174-9154-a4a5c2a70df6';

-- If error occurs, it will be shown here
-- If successful, rollback to not actually complete it yet
ROLLBACK;

-- Alternative: Check what the trigger would do
SELECT 
    id,
    patient_id,
    guest_patient_id,
    is_guest,
    status,
    clinic_id
FROM appointments 
WHERE id = '669cbf83-0581-4174-9154-a4a5c2a70df6';
