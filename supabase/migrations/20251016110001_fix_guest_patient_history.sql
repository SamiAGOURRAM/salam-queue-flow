-- Fix update_patient_history to handle guest patients
-- Guest patients should update guest-specific history
-- Also handles edge cases where neither patient_id nor guest_patient_id exist

CREATE OR REPLACE FUNCTION update_patient_history()
RETURNS TRIGGER AS $$
BEGIN
  -- Only process if status changed to completed
  IF NEW.status = 'completed' AND (OLD.status IS NULL OR OLD.status != 'completed') THEN
    
    -- Handle guest patients with guest_patient_id
    IF NEW.is_guest = true AND NEW.guest_patient_id IS NOT NULL THEN
      INSERT INTO patient_clinic_history (
        guest_patient_id,
        clinic_id,
        is_guest,
        total_visits,
        completed_visits,
        last_visit_date,
        last_appointment_id
      ) VALUES (
        NEW.guest_patient_id,
        NEW.clinic_id,
        true,
        1,
        1,
        NEW.appointment_date,
        NEW.id
      )
      ON CONFLICT (guest_patient_id, clinic_id) 
      DO UPDATE SET
        total_visits = patient_clinic_history.total_visits + 1,
        completed_visits = patient_clinic_history.completed_visits + 1,
        last_visit_date = NEW.appointment_date,
        last_appointment_id = NEW.id,
        updated_at = NOW();
        
    -- Handle regular patients
    ELSIF NEW.patient_id IS NOT NULL THEN
      INSERT INTO patient_clinic_history (
        patient_id,
        clinic_id,
        is_guest,
        total_visits,
        completed_visits,
        last_visit_date,
        last_appointment_id
      ) VALUES (
        NEW.patient_id,
        NEW.clinic_id,
        false,
        1,
        1,
        NEW.appointment_date,
        NEW.id
      )
      ON CONFLICT (patient_id, clinic_id) 
      DO UPDATE SET
        total_visits = patient_clinic_history.total_visits + 1,
        completed_visits = patient_clinic_history.completed_visits + 1,
        last_visit_date = NEW.appointment_date,
        last_appointment_id = NEW.id,
        updated_at = NOW();
        
    -- Handle edge case: guest appointment without guest_patient_id
    ELSIF NEW.is_guest = true AND NEW.guest_patient_id IS NULL THEN
      -- Log warning but don't fail
      RAISE WARNING 'Guest appointment % has no guest_patient_id, skipping history update', NEW.id;
      
    -- Handle edge case: appointment with neither patient_id nor guest_patient_id
    ELSIF NEW.patient_id IS NULL AND NEW.guest_patient_id IS NULL THEN
      -- Log warning but don't fail
      RAISE WARNING 'Appointment % has neither patient_id nor guest_patient_id, skipping history update', NEW.id;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION update_patient_history() IS 
'Update patient history when appointment is completed. Handles both regular and guest patients.';
