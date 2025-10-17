-- Check if clinics table has proper RLS policies for SELECT

SELECT 
    policyname,
    cmd,
    qual as using_expression
FROM pg_policies
WHERE tablename = 'clinics'
AND cmd = 'SELECT'
ORDER BY policyname;

-- Add policy to allow anyone to view basic clinic info (needed for appointments JOIN)
CREATE POLICY IF NOT EXISTS "Anyone can view clinics"
ON clinics
FOR SELECT
USING (true);

-- Or more restrictive: Only allow viewing clinics where user has appointments
-- CREATE POLICY IF NOT EXISTS "Users can view clinics where they have appointments"
-- ON clinics
-- FOR SELECT
-- USING (
--   EXISTS (
--     SELECT 1
--     FROM appointments a
--     WHERE a.clinic_id = clinics.id
--     AND (a.patient_id = auth.uid() OR EXISTS (
--       SELECT 1 FROM clinic_staff cs
--       WHERE cs.clinic_id = clinics.id
--       AND cs.user_id = auth.uid()
--     ))
--   )
--   OR
--   clinics.owner_id = auth.uid()
-- );

-- Verify
SELECT 
    policyname,
    cmd,
    qual as using_expression
FROM pg_policies
WHERE tablename = 'clinics'
AND cmd = 'SELECT'
ORDER BY policyname;
