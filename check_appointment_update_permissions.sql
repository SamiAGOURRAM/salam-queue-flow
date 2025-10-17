-- Check RLS UPDATE policies for appointments table
SELECT 
    schemaname,
    tablename,
    policyname,
    permissive,
    roles,
    cmd,
    qual,
    with_check
FROM pg_policies
WHERE tablename = 'appointments'
AND cmd = 'UPDATE'
ORDER BY policyname;

-- Check if the user is a clinic staff member
SELECT 
    cs.id as staff_id,
    cs.user_id,
    cs.clinic_id,
    cs.role,
    p.full_name,
    p.email
FROM clinic_staff cs
JOIN profiles p ON cs.user_id = p.id
WHERE cs.user_id = '6b35a6de-e5de-4f6c-b544-76318b46aae8';

-- Check the clinic_id of the appointment
SELECT 
    a.id,
    a.clinic_id,
    c.name as clinic_name,
    c.owner_id as clinic_owner
FROM appointments a
JOIN clinics c ON a.clinic_id = c.id
WHERE a.id = '669cbf83-0581-4174-9154-a4a5c2a70df6';

-- Check if user is the clinic owner
SELECT 
    id as clinic_id,
    name,
    owner_id
FROM clinics
WHERE id = '33b67ced-ffd3-4a78-9180-d264fd089a7b';
