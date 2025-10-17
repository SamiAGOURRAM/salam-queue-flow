-- Fix calculate_appointment_features to handle guest patients
-- The function should skip feature calculation for guest patients

CREATE OR REPLACE FUNCTION calculate_appointment_features()
RETURNS TRIGGER AS $$
BEGIN
  -- Skip feature calculation for guest appointments
  IF NEW.is_guest = true OR NEW.patient_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Set day of week (0 = Sunday, 6 = Saturday)
  NEW.day_of_week := EXTRACT(DOW FROM NEW.appointment_date)::INTEGER;
  
  -- Check if it's a holiday (simple check - you can expand this)
  -- For now, we'll set it to false
  NEW.is_holiday := false;
  
  -- Set time slot based on scheduled_time
  IF NEW.scheduled_time IS NOT NULL THEN
    CASE 
      WHEN NEW.scheduled_time < '12:00:00' THEN
        NEW.time_slot := 'morning';
      WHEN NEW.scheduled_time < '17:00:00' THEN
        NEW.time_slot := 'afternoon';
      ELSE
        NEW.time_slot := 'evening';
    END CASE;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION calculate_appointment_features() IS 
'Calculate appointment features for ML predictions. Skips guest patients to avoid errors.';
