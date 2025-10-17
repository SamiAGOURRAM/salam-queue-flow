-- Solution: Add RLS policy to allow clinic owners and staff to view profiles
-- This is needed because the UPDATE query includes a JOIN on profiles table

-- Check current SELECT policies on profiles
SELECT 
    policyname,
    cmd,
    qual as using_expression
FROM pg_policies
WHERE tablename = 'profiles'
AND cmd = 'SELECT'
ORDER BY policyname;

-- Add policy to allow clinic staff to view profiles of patients in their clinic
CREATE POLICY IF NOT EXISTS "Clinic staff can view patient profiles"
ON profiles
FOR SELECT
USING (
  -- Allow clinic owners and staff to view profiles of patients in appointments at their clinic
  EXISTS (
    SELECT 1
    FROM clinic_staff cs
    WHERE cs.user_id = auth.uid()
    AND cs.is_active = true
    AND EXISTS (
      SELECT 1
      FROM appointments a
      WHERE a.patient_id = profiles.id
      AND a.clinic_id = cs.clinic_id
    )
  )
  OR
  EXISTS (
    SELECT 1
    FROM clinics c
    WHERE c.owner_id = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM appointments a
      WHERE a.patient_id = profiles.id
      AND a.clinic_id = c.id
    )
  )
  OR
  -- Users can always view their own profile
  auth.uid() = profiles.id
);

-- Verify the new policy
SELECT 
    policyname,
    cmd,
    qual as using_expression
FROM pg_policies
WHERE tablename = 'profiles'
AND cmd = 'SELECT'
ORDER BY policyname;
