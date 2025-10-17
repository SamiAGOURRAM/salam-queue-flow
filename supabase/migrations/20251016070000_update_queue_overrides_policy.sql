-- Update queue_overrides INSERT policy to match new FK constraints
-- The policy needs to check profiles table since clinic_staff.user_id now references profiles.id

-- First, drop the existing policy
DROP POLICY IF EXISTS "Staff can create queue overrides" ON queue_overrides;

-- Re-create policy with updated checks
CREATE POLICY "Staff can create queue overrides" ON queue_overrides FOR INSERT
  WITH CHECK (
    -- Check if user is clinic owner (through profiles)
    EXISTS (
      SELECT 1 FROM clinics c
      JOIN profiles p ON p.id = c.owner_id
      WHERE c.id = queue_overrides.clinic_id
        AND p.id = auth.uid()
    )
    OR
    -- Check if user is in clinic_staff (directly)
    EXISTS (
      SELECT 1 FROM clinic_staff
      WHERE user_id = auth.uid()
        AND clinic_id = queue_overrides.clinic_id
        AND is_active = true
    )
    OR
    -- Check if user is in user_roles (fallback)
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_id = auth.uid()
        AND clinic_id = queue_overrides.clinic_id
        AND role IN ('clinic_owner', 'staff')
    )
  );

-- Success
DO $$
BEGIN
  RAISE NOTICE 'Queue overrides INSERT policy updated successfully to match new FK constraints';
END $$;