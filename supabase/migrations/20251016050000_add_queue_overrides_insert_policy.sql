-- Add INSERT policy for queue_overrides
-- Allow clinic owners and staff to create queue override records

CREATE POLICY "Staff can create queue overrides" ON queue_overrides FOR INSERT
  WITH CHECK (
    -- Check if user is clinic owner
    EXISTS (
      SELECT 1 FROM clinics
      WHERE id = queue_overrides.clinic_id
        AND owner_id = auth.uid()
    )
    OR
    -- Check if user is in clinic_staff
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
  RAISE NOTICE 'Queue overrides INSERT policy added successfully';
END $$;
