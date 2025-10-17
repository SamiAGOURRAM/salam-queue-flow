-- Final cleanup - Execute this in Supabase SQL Editor
-- This will clean the incorrect history entry and reset the appointment

-- Delete the incomplete history entry (the one with completed_visits = 0)
DELETE FROM patient_clinic_history 
WHERE guest_patient_id = 'eb4b4fbb-be22-472c-aab3-93b1e39df7d3'
AND completed_visits = 0;

-- Reset the appointment status so you can test "Complete visit" in the web app
UPDATE appointments
SET status = 'in_progress'
WHERE id = '669cbf83-0581-4174-9154-a4a5c2a70df6';

-- Verify the appointment is ready for testing
SELECT 
    id,
    patient_id,
    guest_patient_id,
    is_guest,
    status,
    clinic_id
FROM appointments
WHERE id = '669cbf83-0581-4174-9154-a4a5c2a70df6';
