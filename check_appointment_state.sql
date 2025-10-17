-- Check the current state of the specific appointment
SELECT 
    id,
    patient_id,
    clinic_id,
    status,
    queue_position,
    updated_at,
    is_guest
FROM appointments
WHERE id = '669cbf83-0581-4174-9154-a4a5c2a70df6';
