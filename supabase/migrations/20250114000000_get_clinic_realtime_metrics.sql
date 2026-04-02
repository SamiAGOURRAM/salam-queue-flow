-- Create a function to get real-time metrics for a clinic
-- This is used by the ML service to calculate derived features
CREATE OR REPLACE FUNCTION get_clinic_realtime_metrics(p_clinic_id uuid)
RETURNS jsonb AS $$
DECLARE
    v_active_staff int;
    v_no_show_rate numeric;
    v_rolling_avg numeric;
    v_total_today int;
    v_absent_today int;
BEGIN
    -- 1. Active Staff
    -- Count staff marked as active in the clinic
    SELECT count(*) INTO v_active_staff
    FROM clinic_staff
    WHERE clinic_id = p_clinic_id AND is_active = true;

    -- 2. No Show Rate (Today)
    -- (Count of absent_patients today) / (Total appointments today)
    SELECT count(*) INTO v_total_today
    FROM appointments
    WHERE clinic_id = p_clinic_id AND appointment_date = CURRENT_DATE;

    SELECT count(*) INTO v_absent_today
    FROM absent_patients
    WHERE clinic_id = p_clinic_id AND marked_absent_at::date = CURRENT_DATE;

    IF v_total_today > 0 THEN
        v_no_show_rate := v_absent_today::numeric / v_total_today::numeric;
    ELSE
        v_no_show_rate := 0;
    END IF;

    -- 3. Rolling Avg Service Duration (Last 10 Completed)
    -- Average of actual_duration for the last 10 completed appointments
    SELECT AVG(actual_duration) INTO v_rolling_avg
    FROM (
        SELECT actual_duration
        FROM appointments
        WHERE clinic_id = p_clinic_id
        AND status = 'completed'
        AND actual_duration IS NOT NULL
        ORDER BY actual_end_time DESC
        LIMIT 10
    ) recent;

    -- Default if no history yet
    IF v_rolling_avg IS NULL THEN
        v_rolling_avg := 15; -- Default fallback (15 minutes)
    END IF;

    RETURN json_build_object(
        'active_staff_count', v_active_staff,
        'no_show_rate_today', v_no_show_rate,
        'rolling_avg_service_duration', v_rolling_avg
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
