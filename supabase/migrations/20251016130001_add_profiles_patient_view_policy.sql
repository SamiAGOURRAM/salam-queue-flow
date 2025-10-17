-- Fix profiles RLS - Add policy for clinic owners/staff to view patient profiles
-- This is needed because UPDATE appointments with RETURNING includes patient:profiles(...) JOIN

-- Add policy to allow clinic staff and owners to view patient profiles
CREATE POLICY "Clinic staff can view patient profiles"
ON profiles
FOR SELECT
USING (
  -- Clinic owners can view profiles of patients with appointments at their clinic
  EXISTS (
    SELECT 1
    FROM appointments a
    JOIN clinics c ON a.clinic_id = c.id
    WHERE a.patient_id = profiles.id
    AND c.owner_id = auth.uid()
  )
  OR
  -- Staff can view profiles of patients with appointments at their clinic
  EXISTS (
    SELECT 1
    FROM appointments a
    JOIN clinic_staff cs ON a.clinic_id = cs.clinic_id
    WHERE a.patient_id = profiles.id
    AND cs.user_id = auth.uid()
    AND cs.is_active = true
  )
);

-- Verify the new policy was created
SELECT 
    policyname,
    cmd,
    qual as using_expression
FROM pg_policies
WHERE tablename = 'profiles'
AND cmd = 'SELECT'
ORDER BY policyname;
