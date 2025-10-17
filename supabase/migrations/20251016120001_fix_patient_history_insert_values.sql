-- Fix update_patient_history() to set all fields on initial INSERT
-- The previous version only set total_visits=1 but left other fields null

CREATE OR REPLACE FUNCTION public.update_patient_history()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  -- Only update history if appointment is completed
  IF NEW.status = 'completed' THEN
    IF NEW.is_guest = true AND NEW.guest_patient_id IS NOT NULL THEN
      -- Handle guest patient
      INSERT INTO public.patient_clinic_history (
        guest_patient_id, 
        clinic_id, 
        total_visits,
        completed_visits,
        last_visit_date,
        last_appointment_id,
        is_guest
      )
      VALUES (
        NEW.guest_patient_id, 
        NEW.clinic_id, 
        1, 
        1,
        CURRENT_DATE,
        NEW.id,
        true
      )
      ON CONFLICT (guest_patient_id, clinic_id) 
      WHERE guest_patient_id IS NOT NULL AND is_guest = true
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
        completed_visits,
        last_visit_date,
        last_appointment_id,
        is_guest
      )
      VALUES (
        NEW.patient_id, 
        NEW.clinic_id, 
        1,
        1, 
        CURRENT_DATE,
        NEW.id,
        false
      )
      ON CONFLICT (patient_id, clinic_id) 
      WHERE patient_id IS NOT NULL AND is_guest = false
      DO UPDATE SET
        total_visits = patient_clinic_history.total_visits + 1,
        completed_visits = patient_clinic_history.completed_visits + 1,
        last_visit_date = CURRENT_DATE,
        last_appointment_id = NEW.id,
        updated_at = NOW();
    ELSE
      -- Log warning for appointments without valid patient reference
      RAISE WARNING 'Appointment % completed without valid patient_id or guest_patient_id', NEW.id;
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;
