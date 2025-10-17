-- Clean up the incorrect history entry and test again
-- First delete the entry with incomplete data, then test the update

BEGIN;

-- Delete the incomplete history entry
DELETE FROM patient_clinic_history 
WHERE guest_patient_id = 'eb4b4fbb-be22-472c-aab3-93b1e39df7d3';

-- Reset the appointment status to test again
UPDATE appointments
SET status = 'in_progress'
WHERE id = '669cbf83-0581-4174-9154-a4a5c2a70df6';

-- Now complete it again with the fixed trigger
UPDATE appointments
SET status = 'completed'
WHERE id = '669cbf83-0581-4174-9154-a4a5c2a70df6';

-- Check the history - should now have all fields populated
SELECT 
    pch.id,
    pch.guest_patient_id,
    pch.clinic_id,
    pch.total_visits,
    pch.completed_visits,
    pch.last_visit_date,
    pch.last_appointment_id,
    pch.is_guest,
    gp.full_name,
    gp.phone_number
FROM patient_clinic_history pch
LEFT JOIN guest_patients gp ON pch.guest_patient_id = gp.id
WHERE pch.guest_patient_id = 'eb4b4fbb-be22-472c-aab3-93b1e39df7d3';

ROLLBACK;
