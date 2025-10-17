-- Diagnostic and fix for appointment constraints
-- This migration will check the actual constraint names and ensure consistency

-- Step 1: Show all FK constraints on appointments table
DO $$
DECLARE
    constraint_record RECORD;
BEGIN
    RAISE NOTICE 'Current FK constraints on appointments table:';
    FOR constraint_record IN 
        SELECT conname, pg_get_constraintdef(oid) as definition
        FROM pg_constraint 
        WHERE conrelid = 'public.appointments'::regclass 
          AND contype = 'f'
        ORDER BY conname
    LOOP
        RAISE NOTICE 'Constraint: % - Definition: %', constraint_record.conname, constraint_record.definition;
    END LOOP;
END $$;

-- Step 2: Check if we need to drop and recreate the patient_id constraint
DO $$
DECLARE
    constraint_count INTEGER;
BEGIN
    -- Count constraints on patient_id column
    SELECT COUNT(*) INTO constraint_count
    FROM pg_constraint c
    JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY(c.conkey)
    WHERE c.conrelid = 'public.appointments'::regclass
      AND c.contype = 'f'
      AND a.attname = 'patient_id';
    
    RAISE NOTICE 'Found % FK constraints on patient_id column', constraint_count;
    
    -- If there's a constraint, let's ensure it points to profiles.id
    IF constraint_count > 0 THEN
        -- Drop any existing constraint on patient_id
        ALTER TABLE appointments DROP CONSTRAINT IF EXISTS appointments_patient_fkey CASCADE;
        ALTER TABLE appointments DROP CONSTRAINT IF EXISTS appointments_patient_id_fkey CASCADE;
        ALTER TABLE appointments DROP CONSTRAINT IF EXISTS appointments_patient_profile_fkey CASCADE;
        
        -- Create the correct constraint
        ALTER TABLE appointments
        ADD CONSTRAINT appointments_patient_fkey
        FOREIGN KEY (patient_id) REFERENCES profiles(id) ON DELETE CASCADE;
        
        RAISE NOTICE 'Recreated constraint appointments_patient_fkey pointing to profiles(id)';
    END IF;
END $$;

-- Step 3: Verify the final state
DO $$
DECLARE
    constraint_record RECORD;
BEGIN
    RAISE NOTICE 'Final FK constraints on appointments table:';
    FOR constraint_record IN 
        SELECT conname, pg_get_constraintdef(oid) as definition
        FROM pg_constraint 
        WHERE conrelid = 'public.appointments'::regclass 
          AND contype = 'f'
        ORDER BY conname
    LOOP
        RAISE NOTICE 'Constraint: % - Definition: %', constraint_record.conname, constraint_record.definition;
    END LOOP;
END $$;
