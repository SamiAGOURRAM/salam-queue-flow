-- Fix absent_patients RLS policies to allow INSERT operations
-- The previous policies only had USING clause, which doesn't work for INSERT

-- Drop existing policies
DROP POLICY IF EXISTS "Staff can view clinic absent patients" ON absent_patients;
DROP POLICY IF EXISTS "Staff can manage absent patients" ON absent_patients;

-- Create separate policies for each operation type

-- SELECT policy
CREATE POLICY "Staff can view absent patients" ON absent_patients FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM clinic_staff
      WHERE user_id = auth.uid()
        AND clinic_id = absent_patients.clinic_id
        AND is_active = true
    )
    OR
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_id = auth.uid()
        AND clinic_id = absent_patients.clinic_id
        AND role IN ('clinic_owner', 'staff')
    )
    OR
    EXISTS (
      SELECT 1 FROM clinics
      WHERE id = absent_patients.clinic_id
        AND owner_id = auth.uid()
    )
  );

-- INSERT policy - uses WITH CHECK
CREATE POLICY "Staff can create absent patients" ON absent_patients FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM clinic_staff
      WHERE user_id = auth.uid()
        AND clinic_id = absent_patients.clinic_id
        AND is_active = true
    )
    OR
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_id = auth.uid()
        AND clinic_id = absent_patients.clinic_id
        AND role IN ('clinic_owner', 'staff')
    )
    OR
    EXISTS (
      SELECT 1 FROM clinics
      WHERE id = absent_patients.clinic_id
        AND owner_id = auth.uid()
    )
  );

-- UPDATE policy
CREATE POLICY "Staff can update absent patients" ON absent_patients FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM clinic_staff
      WHERE user_id = auth.uid()
        AND clinic_id = absent_patients.clinic_id
        AND is_active = true
    )
    OR
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_id = auth.uid()
        AND clinic_id = absent_patients.clinic_id
        AND role IN ('clinic_owner', 'staff')
    )
    OR
    EXISTS (
      SELECT 1 FROM clinics
      WHERE id = absent_patients.clinic_id
        AND owner_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM clinic_staff
      WHERE user_id = auth.uid()
        AND clinic_id = absent_patients.clinic_id
        AND is_active = true
    )
    OR
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_id = auth.uid()
        AND clinic_id = absent_patients.clinic_id
        AND role IN ('clinic_owner', 'staff')
    )
    OR
    EXISTS (
      SELECT 1 FROM clinics
      WHERE id = absent_patients.clinic_id
        AND owner_id = auth.uid()
    )
  );

-- DELETE policy
CREATE POLICY "Staff can delete absent patients" ON absent_patients FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM clinic_staff
      WHERE user_id = auth.uid()
        AND clinic_id = absent_patients.clinic_id
        AND is_active = true
    )
    OR
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_id = auth.uid()
        AND clinic_id = absent_patients.clinic_id
        AND role IN ('clinic_owner', 'staff')
    )
    OR
    EXISTS (
      SELECT 1 FROM clinics
      WHERE id = absent_patients.clinic_id
        AND owner_id = auth.uid()
    )
  );

-- Success message
DO $$
BEGIN
  RAISE NOTICE 'Absent patients RLS policies fixed - INSERT operations now properly authorized';
END $$;
