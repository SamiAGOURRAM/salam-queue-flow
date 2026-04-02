-- Add RLS policies for absent_patients table
-- Allow clinic staff and owners to manage absent patient records

-- Enable RLS if not already enabled
ALTER TABLE absent_patients ENABLE ROW LEVEL SECURITY;

-- Policy: Clinic staff can view absent patients for their clinic
CREATE POLICY "Clinic staff can view absent patients" 
ON absent_patients 
FOR SELECT 
USING (
  clinic_id IN (
    SELECT clinic_id 
    FROM clinic_staff 
    WHERE user_id = auth.uid()
  )
  OR
  clinic_id IN (
    SELECT id 
    FROM clinics 
    WHERE owner_id = auth.uid()
  )
);

-- Policy: Clinic staff can insert absent patient records for their clinic
CREATE POLICY "Clinic staff can insert absent patients" 
ON absent_patients 
FOR INSERT 
WITH CHECK (
  clinic_id IN (
    SELECT clinic_id 
    FROM clinic_staff 
    WHERE user_id = auth.uid()
  )
  OR
  clinic_id IN (
    SELECT id 
    FROM clinics 
    WHERE owner_id = auth.uid()
  )
);

-- Policy: Clinic staff can update absent patient records for their clinic
CREATE POLICY "Clinic staff can update absent patients" 
ON absent_patients 
FOR UPDATE 
USING (
  clinic_id IN (
    SELECT clinic_id 
    FROM clinic_staff 
    WHERE user_id = auth.uid()
  )
  OR
  clinic_id IN (
    SELECT id 
    FROM clinics 
    WHERE owner_id = auth.uid()
  )
)
WITH CHECK (
  clinic_id IN (
    SELECT clinic_id 
    FROM clinic_staff 
    WHERE user_id = auth.uid()
  )
  OR
  clinic_id IN (
    SELECT id 
    FROM clinics 
    WHERE owner_id = auth.uid()
  )
);

-- Policy: Clinic staff can delete absent patient records for their clinic
CREATE POLICY "Clinic staff can delete absent patients" 
ON absent_patients 
FOR DELETE 
USING (
  clinic_id IN (
    SELECT clinic_id 
    FROM clinic_staff 
    WHERE user_id = auth.uid()
  )
  OR
  clinic_id IN (
    SELECT id 
    FROM clinics 
    WHERE owner_id = auth.uid()
  )
);

COMMENT ON POLICY "Clinic staff can view absent patients" ON absent_patients IS 
'Allows clinic staff and owners to view absent patient records for their clinic';

COMMENT ON POLICY "Clinic staff can insert absent patients" ON absent_patients IS 
'Allows clinic staff and owners to create absent patient records for their clinic';

COMMENT ON POLICY "Clinic staff can update absent patients" ON absent_patients IS 
'Allows clinic staff and owners to update absent patient records for their clinic';

COMMENT ON POLICY "Clinic staff can delete absent patients" ON absent_patients IS 
'Allows clinic staff and owners to delete absent patient records for their clinic';

