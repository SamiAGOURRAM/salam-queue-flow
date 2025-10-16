-- Create guest_patients table for walk-in patients without accounts
-- These can be claimed later when the patient signs up

CREATE TABLE IF NOT EXISTS guest_patients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone_number TEXT NOT NULL,
  full_name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  claimed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  claimed_at TIMESTAMPTZ
);

-- Create unique partial index for unclaimed phone numbers
-- This allows same phone to be used multiple times if claimed
CREATE UNIQUE INDEX IF NOT EXISTS unique_unclaimed_phone 
ON guest_patients(phone_number) 
WHERE claimed_by IS NULL;

-- Create index for phone lookups
CREATE INDEX IF NOT EXISTS idx_guest_patients_phone ON guest_patients(phone_number);
CREATE INDEX IF NOT EXISTS idx_guest_patients_claimed ON guest_patients(claimed_by) WHERE claimed_by IS NOT NULL;

-- Modify appointments table to allow guest patients
-- Drop the existing foreign key constraint
ALTER TABLE appointments 
DROP CONSTRAINT IF EXISTS appointments_patient_id_fkey;

ALTER TABLE appointments
DROP CONSTRAINT IF EXISTS appointments_patient_profile_fkey;

-- Add a new column to indicate if this is a guest
ALTER TABLE appointments
ADD COLUMN IF NOT EXISTS is_guest BOOLEAN DEFAULT false;

-- Add a new column for guest patient reference
ALTER TABLE appointments
ADD COLUMN IF NOT EXISTS guest_patient_id UUID REFERENCES guest_patients(id) ON DELETE SET NULL;

-- patient_id can now be nullable for guest appointments
ALTER TABLE appointments
ALTER COLUMN patient_id DROP NOT NULL;

-- Add constraint: either patient_id or guest_patient_id must be set
ALTER TABLE appointments
ADD CONSTRAINT check_patient_reference 
CHECK (
  (patient_id IS NOT NULL AND guest_patient_id IS NULL AND is_guest = false) OR
  (patient_id IS NULL AND guest_patient_id IS NOT NULL AND is_guest = true)
);

-- Add back the foreign key for registered patients
ALTER TABLE appointments
ADD CONSTRAINT appointments_patient_fkey 
FOREIGN KEY (patient_id) REFERENCES profiles(id) ON DELETE CASCADE;

-- Create a view that combines registered and guest patients for appointments
CREATE OR REPLACE VIEW appointment_patients AS
SELECT 
  a.id as appointment_id,
  COALESCE(p.id, gp.id) as patient_id,
  COALESCE(p.full_name, gp.full_name) as full_name,
  COALESCE(p.phone_number, gp.phone_number) as phone_number,
  COALESCE(p.email, NULL) as email,
  a.is_guest,
  gp.claimed_by,
  gp.claimed_at
FROM appointments a
LEFT JOIN profiles p ON a.patient_id = p.id AND a.is_guest = false
LEFT JOIN guest_patients gp ON a.guest_patient_id = gp.id AND a.is_guest = true;

-- Success
DO $$
BEGIN
  RAISE NOTICE 'Guest patients system created successfully';
END $$;
