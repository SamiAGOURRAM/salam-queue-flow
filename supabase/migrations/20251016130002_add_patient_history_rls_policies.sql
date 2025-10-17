-- Fix patient_clinic_history RLS - Add policies for INSERT and UPDATE
-- These are needed because the update_patient_history() trigger runs with user permissions

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Clinic owners can insert patient history" ON patient_clinic_history;
DROP POLICY IF EXISTS "Clinic owners can update patient history" ON patient_clinic_history;
DROP POLICY IF EXISTS "Clinic owners can view patient history" ON patient_clinic_history;

-- Add INSERT policy for clinic owners and staff
CREATE POLICY "Clinic owners can insert patient history"
ON patient_clinic_history
FOR INSERT
WITH CHECK (
  -- Clinic owners can insert history for their clinic
  EXISTS (
    SELECT 1
    FROM clinics c
    WHERE c.id = patient_clinic_history.clinic_id
    AND c.owner_id = auth.uid()
  )
  OR
  -- Staff can insert history for their clinic
  EXISTS (
    SELECT 1
    FROM clinic_staff cs
    WHERE cs.clinic_id = patient_clinic_history.clinic_id
    AND cs.user_id = auth.uid()
    AND cs.is_active = true
  )
);

-- Add UPDATE policy for clinic owners and staff
CREATE POLICY "Clinic owners can update patient history"
ON patient_clinic_history
FOR UPDATE
USING (
  -- Clinic owners can update history for their clinic
  EXISTS (
    SELECT 1
    FROM clinics c
    WHERE c.id = patient_clinic_history.clinic_id
    AND c.owner_id = auth.uid()
  )
  OR
  -- Staff can update history for their clinic
  EXISTS (
    SELECT 1
    FROM clinic_staff cs
    WHERE cs.clinic_id = patient_clinic_history.clinic_id
    AND cs.user_id = auth.uid()
    AND cs.is_active = true
  )
);

-- Add SELECT policy for clinic owners and staff (needed for ON CONFLICT DO UPDATE)
CREATE POLICY "Clinic owners can view patient history"
ON patient_clinic_history
FOR SELECT
USING (
  -- Clinic owners can view history for their clinic
  EXISTS (
    SELECT 1
    FROM clinics c
    WHERE c.id = patient_clinic_history.clinic_id
    AND c.owner_id = auth.uid()
  )
  OR
  -- Staff can view history for their clinic
  EXISTS (
    SELECT 1
    FROM clinic_staff cs
    WHERE cs.clinic_id = patient_clinic_history.clinic_id
    AND cs.user_id = auth.uid()
    AND cs.is_active = true
  )
  OR
  -- Patients can view their own history
  (patient_clinic_history.is_guest = false AND patient_clinic_history.patient_id = auth.uid())
);

-- Verify the new policies
SELECT 
    policyname,
    cmd,
    qual as using_expression,
    with_check as with_check_expression
FROM pg_policies
WHERE tablename = 'patient_clinic_history'
ORDER BY cmd, policyname;
