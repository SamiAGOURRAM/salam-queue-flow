-- Fix set_absent_grace_period function
-- Problem: Function tries to access NEW.start_time which doesn't exist on absent_patients table
-- Solution: Get start_time from the related appointments table via appointment_id
-- Also fix: Remove INSERT statement (this is a BEFORE INSERT trigger, should just set NEW values)

CREATE OR REPLACE FUNCTION public.set_absent_grace_period()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE
  v_grace_period_minutes INT := 15;
  v_grace_period_ends_at TIMESTAMP WITH TIME ZONE;
  v_appointment_start_time TIMESTAMP WITH TIME ZONE;
BEGIN
  -- Only set grace period if marked_absent_at is being set
  IF NEW.marked_absent_at IS NOT NULL THEN
    -- Get start_time from the related appointments table
    SELECT start_time INTO v_appointment_start_time
    FROM appointments
    WHERE id = NEW.appointment_id;
    
    -- Use appointment start_time if available, otherwise use marked_absent_at
    IF v_appointment_start_time IS NOT NULL THEN
      v_grace_period_ends_at := v_appointment_start_time + (v_grace_period_minutes || ' minutes')::INTERVAL;
    ELSE
      v_grace_period_ends_at := NEW.marked_absent_at + (v_grace_period_minutes || ' minutes')::INTERVAL;
    END IF;
    
    -- Set the grace_period_ends_at directly on NEW (this is a BEFORE INSERT trigger)
    NEW.grace_period_ends_at := v_grace_period_ends_at;
  END IF;

  RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION public.set_absent_grace_period() IS 
'BEFORE INSERT trigger function that sets grace_period_ends_at based on appointment start_time or marked_absent_at. Fixed to get start_time from appointments table.';

