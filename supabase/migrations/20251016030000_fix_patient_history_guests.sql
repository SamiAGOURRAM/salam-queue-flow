-- Fix patient_clinic_history to support guest patients
-- Allow NULL patient_id for guest appointments

-- Make patient_id nullable
ALTER TABLE patient_clinic_history
ALTER COLUMN patient_id DROP NOT NULL;

-- Add guest_patient_id column
ALTER TABLE patient_clinic_history
ADD COLUMN IF NOT EXISTS guest_patient_id UUID REFERENCES guest_patients(id) ON DELETE SET NULL;

-- Add is_guest flag
ALTER TABLE patient_clinic_history
ADD COLUMN IF NOT EXISTS is_guest BOOLEAN DEFAULT false;

-- Drop old unique constraint
ALTER TABLE patient_clinic_history
DROP CONSTRAINT IF EXISTS patient_clinic_history_patient_id_clinic_id_key;

-- Add new unique constraints
CREATE UNIQUE INDEX IF NOT EXISTS unique_patient_clinic_history 
ON patient_clinic_history(patient_id, clinic_id) 
WHERE patient_id IS NOT NULL AND is_guest = false;

CREATE UNIQUE INDEX IF NOT EXISTS unique_guest_clinic_history 
ON patient_clinic_history(guest_patient_id, clinic_id) 
WHERE guest_patient_id IS NOT NULL AND is_guest = true;

-- Update the trigger function to handle guests
CREATE OR REPLACE FUNCTION update_patient_history() 
RETURNS TRIGGER AS $$
BEGIN
  -- Only update history if appointment is completed
  IF NEW.status = 'completed' THEN
    IF NEW.is_guest = true AND NEW.guest_patient_id IS NOT NULL THEN
      -- Handle guest patient
      INSERT INTO public.patient_clinic_history (
        guest_patient_id, 
        clinic_id, 
        total_visits,
        is_guest
      )
      VALUES (NEW.guest_patient_id, NEW.clinic_id, 1, true)
      ON CONFLICT (guest_patient_id, clinic_id) 
      WHERE is_guest = true
      DO UPDATE SET
        total_visits = patient_clinic_history.total_visits + 1,
        completed_visits = patient_clinic_history.completed_visits + 1,
        last_visit_date = CURRENT_DATE,
        last_appointment_id = NEW.id,
        updated_at = NOW();
    ELSIF NEW.patient_id IS NOT NULL THEN
      -- Handle registered patient
      INSERT INTO public.patient_clinic_history (
        patient_id, 
        clinic_id, 
        total_visits,
        is_guest
      )
      VALUES (NEW.patient_id, NEW.clinic_id, 1, false)
      ON CONFLICT (patient_id, clinic_id) 
      WHERE is_guest = false
      DO UPDATE SET
        total_visits = patient_clinic_history.total_visits + 1,
        completed_visits = patient_clinic_history.completed_visits + 1,
        last_visit_date = CURRENT_DATE,
        last_appointment_id = NEW.id,
        updated_at = NOW();
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Success
DO $$
BEGIN
  RAISE NOTICE 'Patient clinic history updated to support guest patients';
END $$;
