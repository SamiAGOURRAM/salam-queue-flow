-- Fix absent_patients foreign key to point to profiles instead of auth.users
-- This will allow Supabase to find the relationship

-- Drop the existing FK constraint
ALTER TABLE absent_patients
DROP CONSTRAINT IF EXISTS absent_patients_patient_id_fkey;

-- Add new FK constraint pointing to profiles
ALTER TABLE absent_patients
ADD CONSTRAINT absent_patients_patient_id_fkey 
FOREIGN KEY (patient_id) 
REFERENCES profiles(id) 
ON DELETE CASCADE;

-- Verify the change
SELECT
    conname as constraint_name,
    conrelid::regclass as table_name,
    confrelid::regclass as foreign_table,
    a.attname as column_name,
    af.attname as foreign_column
FROM pg_constraint c
JOIN pg_attribute a ON a.attnum = ANY(c.conkey) AND a.attrelid = c.conrelid
JOIN pg_attribute af ON af.attnum = ANY(c.confkey) AND af.attrelid = c.confrelid
WHERE conrelid = 'absent_patients'::regclass
AND contype = 'f'
AND conname = 'absent_patients_patient_id_fkey';
