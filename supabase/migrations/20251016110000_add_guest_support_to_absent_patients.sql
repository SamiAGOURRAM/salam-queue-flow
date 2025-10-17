-- Allow absent_patients to support guest patients
-- This aligns absent_patients structure with appointments table

-- Step 1: Make patient_id nullable to support guest patients
ALTER TABLE absent_patients 
  ALTER COLUMN patient_id DROP NOT NULL;

-- Step 2: Add guest_patient_id column (similar to appointments table)
ALTER TABLE absent_patients 
  ADD COLUMN IF NOT EXISTS guest_patient_id UUID REFERENCES guest_patients(id);

-- Step 3: Add is_guest flag for clarity
ALTER TABLE absent_patients 
  ADD COLUMN IF NOT EXISTS is_guest BOOLEAN DEFAULT false;

-- Step 4: Add check constraint to ensure either patient_id or guest_patient_id is set
ALTER TABLE absent_patients
  ADD CONSTRAINT absent_patients_patient_type_check 
  CHECK (
    (patient_id IS NOT NULL AND guest_patient_id IS NULL AND is_guest = false)
    OR
    (patient_id IS NULL AND guest_patient_id IS NOT NULL AND is_guest = true)
  );

-- Step 5: Create index for guest lookups
CREATE INDEX IF NOT EXISTS idx_absent_patients_guest 
  ON absent_patients(guest_patient_id) 
  WHERE guest_patient_id IS NOT NULL;

-- Success message
DO $$
BEGIN
  RAISE NOTICE 'absent_patients table updated to support guest patients';
END $$;
