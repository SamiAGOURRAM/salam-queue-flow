-- Fix patient_clinic_history table - Add missing UNIQUE constraints
-- This fixes the "no unique or exclusion constraint matching" error

-- First, check current table structure
SELECT 
    conname as constraint_name,
    contype as constraint_type,
    pg_get_constraintdef(oid) as constraint_definition
FROM pg_constraint
WHERE conrelid = 'patient_clinic_history'::regclass;

-- Add UNIQUE partial indexes for ON CONFLICT clauses
-- For guest patients
CREATE UNIQUE INDEX IF NOT EXISTS patient_clinic_history_guest_unique 
ON patient_clinic_history (guest_patient_id, clinic_id) 
WHERE is_guest = true AND guest_patient_id IS NOT NULL;

-- For registered patients  
CREATE UNIQUE INDEX IF NOT EXISTS patient_clinic_history_patient_unique
ON patient_clinic_history (patient_id, clinic_id)
WHERE is_guest = false AND patient_id IS NOT NULL;

-- Verify the indexes were created
SELECT 
    schemaname,
    tablename,
    indexname,
    indexdef
FROM pg_indexes
WHERE tablename = 'patient_clinic_history'
ORDER BY indexname;
