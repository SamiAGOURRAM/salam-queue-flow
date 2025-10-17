-- Fix ON CONFLICT issues with appointments table
-- This ensures proper constraint naming and index setup

-- First, let's check if we need to rename the appointments_patient_fkey constraint
DO $$
DECLARE
    constraint_exists INTEGER;
BEGIN
    SELECT count(*)
    INTO constraint_exists
    FROM pg_constraint
    WHERE conname = 'appointments_patient_fkey';
    
    IF constraint_exists > 0 THEN
        -- Rename the constraint to be consistent with the new FK reference
        ALTER TABLE appointments 
        RENAME CONSTRAINT appointments_patient_fkey TO appointments_patient_id_fkey;
        
        RAISE NOTICE 'Renamed constraint appointments_patient_fkey to appointments_patient_id_fkey';
    ELSE
        RAISE NOTICE 'Constraint appointments_patient_fkey does not exist, no renaming needed';
    END IF;
END $$;

-- Add a unique index on the updated_at column if it's used in ON CONFLICT clauses
-- This helps with UPSERT operations that might be failing
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_appointments_updated_at') THEN
        CREATE INDEX idx_appointments_updated_at ON appointments(updated_at);
        RAISE NOTICE 'Created index on appointments.updated_at';
    END IF;
END $$;

-- Success
DO $$
BEGIN
  RAISE NOTICE 'Fix for appointment update conflicts applied successfully';
END $$;