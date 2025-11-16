-- Function to record queue snapshot for ML training
-- This function bypasses RLS by using SECURITY DEFINER

CREATE OR REPLACE FUNCTION record_queue_snapshot(
  p_clinic_id uuid,
  p_snapshot_date date,
  p_snapshot_time timestamp with time zone,
  p_total_waiting integer,
  p_total_in_progress integer,
  p_total_completed_today integer,
  p_average_wait_time integer DEFAULT NULL,
  p_longest_wait_time integer DEFAULT NULL,
  p_current_delay_minutes integer DEFAULT 0,
  p_active_staff_count integer DEFAULT 0,
  p_staff_utilization double precision DEFAULT 0
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Validate clinic exists
  IF NOT EXISTS (SELECT 1 FROM clinics WHERE id = p_clinic_id) THEN
    RAISE EXCEPTION 'Clinic not found: %', p_clinic_id;
  END IF;

  -- Insert snapshot
  INSERT INTO queue_snapshots (
    clinic_id,
    snapshot_date,
    snapshot_time,
    total_waiting,
    total_in_progress,
    total_completed_today,
    average_wait_time,
    longest_wait_time,
    current_delay_minutes,
    active_staff_count,
    staff_utilization
  ) VALUES (
    p_clinic_id,
    p_snapshot_date,
    p_snapshot_time,
    p_total_waiting,
    p_total_in_progress,
    p_total_completed_today,
    p_average_wait_time,
    p_longest_wait_time,
    p_current_delay_minutes,
    p_active_staff_count,
    p_staff_utilization
  );
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION record_queue_snapshot(
  uuid, date, timestamp with time zone, integer, integer, integer, 
  integer, integer, integer, integer, double precision
) TO authenticated;

-- Add comment
COMMENT ON FUNCTION record_queue_snapshot IS 'Records queue snapshot for ML training and historical analysis. Bypasses RLS for authorized users.';

