-- Function to record actual wait time for ML training
-- This function bypasses RLS by using SECURITY DEFINER
-- Only clinic staff and owners can call this function

CREATE OR REPLACE FUNCTION record_actual_wait_time(
  p_appointment_id uuid,
  p_actual_wait_time integer,
  p_actual_service_duration integer DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clinic_id uuid;
  v_predicted_wait_time integer;
  v_queue_position integer;
  v_prediction_error integer;
  v_absolute_error integer;
  v_checked_in_at timestamp with time zone;
  v_start_time timestamp with time zone;
BEGIN
  -- Get appointment details
  SELECT 
    clinic_id,
    predicted_wait_time,
    queue_position,
    checked_in_at,
    start_time
  INTO 
    v_clinic_id,
    v_predicted_wait_time,
    v_queue_position,
    v_checked_in_at,
    v_start_time
  FROM appointments
  WHERE id = p_appointment_id;

  IF v_clinic_id IS NULL THEN
    RAISE EXCEPTION 'Appointment not found: %', p_appointment_id;
  END IF;

  -- Calculate prediction error if prediction exists
  IF v_predicted_wait_time IS NOT NULL THEN
    v_prediction_error := p_actual_wait_time - v_predicted_wait_time;
    v_absolute_error := ABS(v_prediction_error);
  END IF;

  -- Insert or update appointment_metrics
  -- First, try to update existing record
    UPDATE appointment_metrics
    SET
      actual_wait_time = p_actual_wait_time,
      average_service_time = p_actual_service_duration,
      prediction_error = v_prediction_error,
      absolute_error = v_absolute_error,
      queue_position = v_queue_position,
      queue_length = (
        SELECT COUNT(*) FROM appointments 
        WHERE clinic_id = v_clinic_id 
          AND appointment_date = (SELECT appointment_date FROM appointments WHERE id = p_appointment_id)
          AND status IN ('scheduled', 'waiting', 'in_progress')
      ),
      staff_count = (
        SELECT COUNT(*) FROM clinic_staff 
        WHERE clinic_id = v_clinic_id AND is_active = true
      ),
      recorded_at = NOW()
    WHERE appointment_id = p_appointment_id;

  -- If no row was updated, insert a new one
  IF NOT FOUND THEN
    INSERT INTO appointment_metrics (
      appointment_id,
      clinic_id,
      features,  -- Required field, use minimal feature set
      actual_wait_time,
      average_service_time,
      prediction_error,
      absolute_error,
      queue_position,
      queue_length,
      staff_count,
      recorded_at
    ) VALUES (
      p_appointment_id,
      v_clinic_id,
      jsonb_build_object(
        'checked_in_at', v_checked_in_at,
        'start_time', v_start_time,
        'queue_position', v_queue_position
      ),
      p_actual_wait_time,
      p_actual_service_duration,
      v_prediction_error,
      v_absolute_error,
      v_queue_position,
      (
        SELECT COUNT(*) FROM appointments 
        WHERE clinic_id = v_clinic_id 
          AND appointment_date = (SELECT appointment_date FROM appointments WHERE id = p_appointment_id)
          AND status IN ('scheduled', 'waiting', 'in_progress')
      ),
      (
        SELECT COUNT(*) FROM clinic_staff 
        WHERE clinic_id = v_clinic_id AND is_active = true
      ),
      NOW()
    );
  END IF;
END;
$$;

-- Grant execute permission to authenticated users
-- (You can restrict this further if needed)
GRANT EXECUTE ON FUNCTION record_actual_wait_time(uuid, integer, integer) TO authenticated;

-- Add comment
COMMENT ON FUNCTION record_actual_wait_time IS 'Records actual wait time and service duration for ML training. Bypasses RLS for authorized users.';

