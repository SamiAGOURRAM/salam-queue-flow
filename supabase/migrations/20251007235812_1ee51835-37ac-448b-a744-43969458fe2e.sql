-- Fix function search path security warnings
-- All functions should have explicit search_path set

-- Fix calculate_appointment_features function
CREATE OR REPLACE FUNCTION calculate_appointment_features() 
RETURNS TRIGGER AS $$
BEGIN
  NEW.day_of_week := EXTRACT(ISODOW FROM NEW.appointment_date);
  
  IF NEW.scheduled_time IS NOT NULL THEN
    NEW.time_slot := CASE
      WHEN NEW.scheduled_time < '12:00'::TIME THEN 'morning'
      WHEN NEW.scheduled_time < '17:00'::TIME THEN 'afternoon'
      ELSE 'evening'
    END;
  END IF;
  
  IF NEW.checked_in_at IS NOT NULL AND (OLD IS NULL OR OLD.checked_in_at IS NULL) THEN
    IF NEW.scheduled_time IS NOT NULL THEN
      NEW.late_by_minutes := EXTRACT(EPOCH FROM (
        NEW.checked_in_at - (NEW.appointment_date + NEW.scheduled_time)
      ))::INTEGER / 60;
    END IF;
  END IF;
  
  IF NEW.status = 'completed' AND NEW.actual_start_time IS NOT NULL AND NEW.actual_end_time IS NOT NULL THEN
    NEW.actual_duration := EXTRACT(EPOCH FROM (NEW.actual_end_time - NEW.actual_start_time))::INTEGER / 60;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Fix update_patient_history function
CREATE OR REPLACE FUNCTION update_patient_history() 
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.patient_clinic_history (patient_id, clinic_id, total_visits)
  VALUES (NEW.patient_id, NEW.clinic_id, 0)
  ON CONFLICT (patient_id, clinic_id) DO NOTHING;
  
  IF NEW.status IN ('completed', 'no_show', 'cancelled') AND 
     (OLD IS NULL OR OLD.status NOT IN ('completed', 'no_show', 'cancelled')) THEN
    
    UPDATE public.patient_clinic_history SET
      total_visits = total_visits + 1,
      completed_visits = CASE WHEN NEW.status = 'completed' THEN completed_visits + 1 ELSE completed_visits END,
      no_show_count = CASE WHEN NEW.status = 'no_show' THEN no_show_count + 1 ELSE no_show_count END,
      cancellation_count = CASE WHEN NEW.status = 'cancelled' THEN cancellation_count + 1 ELSE cancellation_count END,
      last_visit_date = NEW.appointment_date,
      last_appointment_id = NEW.id,
      updated_at = NOW()
    WHERE patient_id = NEW.patient_id AND clinic_id = NEW.clinic_id;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Fix update_updated_at_column function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;