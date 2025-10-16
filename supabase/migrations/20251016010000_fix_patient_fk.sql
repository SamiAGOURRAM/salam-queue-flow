-- Fix foreign key relationship between appointments and profiles
-- Currently patient_id references auth.users, but we need it to also work with profiles

-- Since profiles.id should match auth.users.id (1-to-1), we can safely work with this
-- But PostgREST needs an explicit foreign key to use the embedded syntax

-- Add foreign key constraint from appointments.patient_id to profiles.id
-- This is safe because profiles.id = auth.users.id
ALTER TABLE appointments 
DROP CONSTRAINT IF EXISTS appointments_patient_profile_fkey;

ALTER TABLE appointments
ADD CONSTRAINT appointments_patient_profile_fkey 
FOREIGN KEY (patient_id) REFERENCES profiles(id) ON DELETE CASCADE;

-- Success message
DO $$
BEGIN
  RAISE NOTICE 'Foreign key relationship added: appointments.patient_id -> profiles.id';
END $$;
