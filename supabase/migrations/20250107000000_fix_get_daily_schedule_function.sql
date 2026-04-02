-- Migration: Create get_daily_schedule functions
-- Uses checked_in_at (not actual_start_time), no guest_patients references

DROP FUNCTION IF EXISTS get_daily_schedule_for_clinic(uuid, date) CASCADE;
DROP FUNCTION IF EXISTS get_daily_schedule_for_staff(uuid, text) CASCADE;

CREATE OR REPLACE FUNCTION get_daily_schedule_for_clinic(
  p_clinic_id uuid,
  p_target_date date
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_schedule json;
  v_effective_mode text;
BEGIN
  v_effective_mode := get_effective_queue_mode(p_clinic_id, p_target_date);

  SELECT json_build_object(
    'operating_mode', v_effective_mode,
    'schedule', COALESCE(
      (
        SELECT json_agg(
          json_build_object(
            'id', a.id,
            'clinic_id', a.clinic_id,
            'patient_id', a.patient_id,
            'staff_id', a.staff_id,
            'scheduled_time', a.scheduled_time,
            'time_slot', a.time_slot,
            'appointment_date', a.appointment_date,
            'queue_position', a.queue_position,
            'status', a.status,
            'appointment_type', a.appointment_type,
            'reason_for_visit', a.reason_for_visit,
            'is_present', a.is_present,
            'marked_absent_at', a.marked_absent_at,
            'returned_at', a.returned_at,
            'checked_in_at', a.checked_in_at,
            'actual_end_time', a.actual_end_time,
            'estimated_duration', a.estimated_duration,
            'predicted_wait_time', a.predicted_wait_time,
            'prediction_confidence', a.prediction_confidence,
            'predicted_start_time', a.predicted_start_time,
            'last_prediction_update', a.last_prediction_update,
            'priority_score', a.priority_score,
            'is_gap_filler', a.is_gap_filler,
            'created_at', a.created_at,
            'updated_at', a.updated_at,
            'original_queue_position', a.original_queue_position,
            'skip_count', a.skip_count,
            'skip_reason', a.skip_reason,
            'override_by', a.override_by,
            'is_walk_in', a.is_walk_in,
            'patient', (
              SELECT json_build_object(
                'id', p.id,
                'full_name', p.full_name,
                'phone_number', p.phone_number,
                'email', p.email
              )
              FROM profiles p
              WHERE p.id = a.patient_id
            ),
            'clinic', (
              SELECT json_build_object(
                'id', c.id,
                'name', c.name,
                'specialty', c.specialty,
                'city', c.city,
                'address', c.address,
                'phone', c.phone
              )
              FROM clinics c
              WHERE c.id = a.clinic_id
            )
          )
          ORDER BY
            a.queue_position NULLS LAST,
            COALESCE(a.scheduled_time, '00:00') ASC,
            a.created_at ASC
        )
        FROM appointments a
        WHERE a.clinic_id = p_clinic_id
          AND a.appointment_date = p_target_date
          AND a.status IN ('scheduled', 'waiting', 'in_progress', 'completed')
      ),
      '[]'::json
    )
  ) INTO v_schedule;

  RETURN v_schedule;
END;
$$;

GRANT EXECUTE ON FUNCTION get_daily_schedule_for_clinic(uuid, date) TO authenticated;

CREATE OR REPLACE FUNCTION get_daily_schedule_for_staff(
  p_staff_id uuid,
  p_target_date text
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_schedule json;
  v_clinic_id uuid;
  v_effective_mode text;
  v_target_date date;
BEGIN
  SELECT clinic_id INTO v_clinic_id
  FROM clinic_staff WHERE id = p_staff_id;

  IF v_clinic_id IS NULL THEN
    RAISE EXCEPTION 'Staff member not found: %', p_staff_id;
  END IF;

  v_target_date := p_target_date::date;
  v_effective_mode := get_effective_queue_mode(v_clinic_id, v_target_date);

  SELECT json_build_object(
    'operating_mode', v_effective_mode,
    'schedule', COALESCE(
      (
        SELECT json_agg(
          json_build_object(
            'id', a.id,
            'clinic_id', a.clinic_id,
            'patient_id', a.patient_id,
            'staff_id', a.staff_id,
            'scheduled_time', a.scheduled_time,
            'time_slot', a.time_slot,
            'appointment_date', a.appointment_date,
            'queue_position', a.queue_position,
            'status', a.status,
            'appointment_type', a.appointment_type,
            'reason_for_visit', a.reason_for_visit,
            'is_present', a.is_present,
            'marked_absent_at', a.marked_absent_at,
            'returned_at', a.returned_at,
            'checked_in_at', a.checked_in_at,
            'actual_end_time', a.actual_end_time,
            'estimated_duration', a.estimated_duration,
            'predicted_wait_time', a.predicted_wait_time,
            'prediction_confidence', a.prediction_confidence,
            'predicted_start_time', a.predicted_start_time,
            'last_prediction_update', a.last_prediction_update,
            'priority_score', a.priority_score,
            'is_gap_filler', a.is_gap_filler,
            'created_at', a.created_at,
            'updated_at', a.updated_at,
            'original_queue_position', a.original_queue_position,
            'skip_count', a.skip_count,
            'skip_reason', a.skip_reason,
            'override_by', a.override_by,
            'is_walk_in', a.is_walk_in,
            'patient', (
              SELECT json_build_object(
                'id', p.id,
                'full_name', p.full_name,
                'phone_number', p.phone_number,
                'email', p.email
              )
              FROM profiles p
              WHERE p.id = a.patient_id
            ),
            'clinic', (
              SELECT json_build_object(
                'id', c.id,
                'name', c.name,
                'specialty', c.specialty,
                'city', c.city,
                'address', c.address,
                'phone', c.phone
              )
              FROM clinics c
              WHERE c.id = a.clinic_id
            )
          )
          ORDER BY
            a.queue_position NULLS LAST,
            COALESCE(a.scheduled_time, '00:00') ASC,
            a.created_at ASC
        )
        FROM appointments a
        WHERE a.clinic_id = v_clinic_id
          AND a.staff_id = p_staff_id
          AND a.appointment_date = v_target_date
          AND a.status IN ('scheduled', 'waiting', 'in_progress', 'completed')
      ),
      '[]'::json
    )
  ) INTO v_schedule;

  RETURN v_schedule;
END;
$$;

GRANT EXECUTE ON FUNCTION get_daily_schedule_for_staff(uuid, text) TO authenticated;
