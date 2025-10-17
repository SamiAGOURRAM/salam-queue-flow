-- Add unique constraints for patient_clinic_history if they don't exist
-- This prevents duplicate history entries

DO $$
BEGIN
    -- Add unique constraint for regular patients
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'patient_clinic_history_patient_clinic_unique'
    ) THEN
        ALTER TABLE patient_clinic_history
        ADD CONSTRAINT patient_clinic_history_patient_clinic_unique
        UNIQUE (patient_id, clinic_id)
        WHERE patient_id IS NOT NULL;
        
        RAISE NOTICE 'Added unique constraint for regular patients';
    END IF;
    
    -- Add unique constraint for guest patients
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'patient_clinic_history_guest_clinic_unique'
    ) THEN
        ALTER TABLE patient_clinic_history
        ADD CONSTRAINT patient_clinic_history_guest_clinic_unique
        UNIQUE (guest_patient_id, clinic_id)
        WHERE guest_patient_id IS NOT NULL;
        
        RAISE NOTICE 'Added unique constraint for guest patients';
    END IF;
END $$;
