-- Fix queue_overrides INSERT policy - Simplify and make it more robust
-- The current policy is too complex and causes 403 errors

-- Drop the existing policy
DROP POLICY IF EXISTS "Staff can create queue overrides" ON queue_overrides;

-- Create a simpler, more reliable policy
CREATE POLICY "Staff can create queue overrides"
ON queue_overrides
FOR INSERT
WITH CHECK (
  -- User must be clinic owner OR active staff for the clinic
  EXISTS (
    SELECT 1
    FROM clinics c
    WHERE c.id = queue_overrides.clinic_id
    AND c.owner_id = auth.uid()
  )
  OR
  EXISTS (
    SELECT 1
    FROM clinic_staff cs
    WHERE cs.clinic_id = queue_overrides.clinic_id
    AND cs.user_id = auth.uid()
    AND cs.is_active = true
  )
);

-- Verify the new policy
SELECT 
    policyname,
    cmd,
    with_check as with_check_expression
FROM pg_policies
WHERE tablename = 'queue_overrides'
AND cmd = 'INSERT';
