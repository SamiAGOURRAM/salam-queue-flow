-- Migration: Add get_queue_mode_for_date alias for backward compatibility
-- Description: Creates an alias function that maps to get_effective_queue_mode
-- This ensures existing code calling get_queue_mode_for_date continues to work

CREATE OR REPLACE FUNCTION get_queue_mode_for_date(p_clinic_id uuid, p_date date)
RETURNS TEXT AS $$
BEGIN
    -- Simply call the clean standard function
    RETURN get_effective_queue_mode(p_clinic_id, p_date);
END;
$$ LANGUAGE plpgsql STABLE;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION get_queue_mode_for_date(uuid, date) TO authenticated;
GRANT EXECUTE ON FUNCTION get_queue_mode_for_date(uuid, date) TO anon;

