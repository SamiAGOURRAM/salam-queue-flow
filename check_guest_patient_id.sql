-- Check if the guest appointment has a guest_patient_id
SELECT 
    a.id,
    a.patient_id,
    a.guest_patient_id,
    a.is_guest,
    a.status,
    gp.full_name as guest_name,
    gp.phone_number as guest_phone
FROM appointments a
LEFT JOIN guest_patients gp ON a.guest_patient_id = gp.id
WHERE a.id = '669cbf83-0581-4174-9154-a4a5c2a70df6';
