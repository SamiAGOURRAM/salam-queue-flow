-- Test the exact query that the app is trying to execute
-- This will show us the exact error message

-- Try to INSERT and SELECT with the patient JOIN
WITH inserted AS (
  INSERT INTO absent_patients (
    appointment_id,
    clinic_id,
    patient_id,
    marked_by,
    reason
  )
  VALUES (
    '669cbf83-0581-4174-9154-a4a5c2a70df6',
    '33b67ced-ffd3-4a78-9180-d264fd089a7b',
    NULL,  -- Testing with NULL patient_id (for guest)
    '6b35a6de-e5de-4f6c-b544-76318b46aae8',
    'Test absent marking'
  )
  RETURNING *
)
SELECT 
  ap.*,
  a.id as appointment_id,
  a.status as appointment_status,
  p.id as patient_profile_id,
  p.full_name as patient_name
FROM inserted ap
LEFT JOIN appointments a ON ap.appointment_id = a.id
LEFT JOIN profiles p ON ap.patient_id = p.id;

-- Clean up the test
DELETE FROM absent_patients 
WHERE reason = 'Test absent marking';
