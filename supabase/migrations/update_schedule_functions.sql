-- Migration: Update Schedule Functions to use Smart Queue Logic
-- Description: Updates get_daily_schedule_* functions to return effective queue_mode and sort correctly.
-- Author: QueueMed AI

-- Update get_daily_schedule_for_clinic
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
  -- Get effective queue mode (Day-Aware)
  v_effective_mode := get_effective_queue_mode(p_clinic_id, p_target_date);

  -- Get schedule with all appointments for the clinic on the target date
  SELECT json_build_object(
    'queue_mode', v_effective_mode, -- Return the computed mode ('fixed', 'fluid')
    'operating_mode', v_effective_mode, -- Keep for backward compatibility
    'schedule', COALESCE(
      (
        SELECT json_agg(
          json_build_object(
            'id', a.id,
            'clinic_id', a.clinic_id,
            'patient_id', a.patient_id,
            'guest_patient_id', a.guest_patient_id,
            'staff_id', a.staff_id,
            'start_time', a.start_time,
            'end_time', a.end_time,
            'appointment_date', a.appointment_date,
            'queue_position', a.queue_position,
            'status', a.status,
            'appointment_type', a.appointment_type,
            'is_present', a.is_present,
            'marked_absent_at', a.marked_absent_at,
            'returned_at', a.returned_at,
            'checked_in_at', a.checked_in_at,
            'actual_end_time', a.actual_end_time,
            'estimated_duration', a.estimated_duration,
            'predicted_wait_time', a.predicted_wait_time,
            'prediction_mode', a.prediction_mode,
            'prediction_confidence', a.prediction_confidence,
            'predicted_start_time', a.predicted_start_time,
            'last_prediction_update', a.last_prediction_update,
            'created_at', a.created_at,
            'updated_at', a.updated_at,
            'is_guest', a.is_guest,
            'original_queue_position', a.original_queue_position,
            'skip_count', a.skip_count,
            'skip_reason', a.skip_reason,
            'override_by', a.override_by,
            'is_walk_in', a.is_walk_in,
            'priority_score', a.priority_score, -- NEW FIELD
            'is_gap_filler', a.is_gap_filler,   -- NEW FIELD
            'patient', CASE 
              WHEN a.is_guest = false AND a.patient_id IS NOT NULL THEN
                (SELECT json_build_object(
                  'id', p.id,
                  'full_name', p.full_name,
                  'phone_number', p.phone_number,
                  'email', p.email
                )
                FROM profiles p
                WHERE p.id = a.patient_id)
              ELSE NULL
            END,
            'guest_patient', CASE
              WHEN a.is_guest = true AND a.guest_patient_id IS NOT NULL THEN
                (SELECT json_build_object(
                  'id', gp.id,
                  'full_name', gp.full_name,
                  'phone_number', gp.phone_number
                )
                FROM guest_patients gp
                WHERE gp.id = a.guest_patient_id)
              ELSE NULL
            END,
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
            -- Primary Sort: Queue Position (The "Brain" has already calculated this)
            -- If position is null (completed/cancelled), fall back to time
            a.queue_position NULLS LAST,
            
            -- Secondary Sort: Start Time (for fixed mode visualization or ties)
            COALESCE(a.start_time, a.appointment_date::timestamp) ASC
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

-- Update get_daily_schedule_for_staff
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
  v_target_date_date date;
BEGIN
  -- Get clinic_id from staff
  SELECT clinic_id INTO v_clinic_id
  FROM clinic_staff WHERE id = p_staff_id;

  IF v_clinic_id IS NULL THEN
    RAISE EXCEPTION 'Staff member not found or has no associated clinic: %', p_staff_id;
  END IF;

  v_target_date_date := p_target_date::date;
  
  -- Get effective queue mode (Day-Aware)
  v_effective_mode := get_effective_queue_mode(v_clinic_id, v_target_date_date);

  SELECT json_build_object(
    'queue_mode', v_effective_mode,
    'operating_mode', v_effective_mode,
    'schedule', COALESCE(
      (
        SELECT json_agg(
          json_build_object(
            'id', a.id,
            'clinic_id', a.clinic_id,
            'patient_id', a.patient_id,
            'guest_patient_id', a.guest_patient_id,
            'staff_id', a.staff_id,
            'start_time', a.start_time,
            'end_time', a.end_time,
            'appointment_date', a.appointment_date,
            'queue_position', a.queue_position,
            'status', a.status,
            'appointment_type', a.appointment_type,
            'is_present', a.is_present,
            'marked_absent_at', a.marked_absent_at,
            'returned_at', a.returned_at,
            'checked_in_at', a.checked_in_at,
            'actual_end_time', a.actual_end_time,
            'estimated_duration', a.estimated_duration,
            'predicted_wait_time', a.predicted_wait_time,
            'prediction_mode', a.prediction_mode,
            'prediction_confidence', a.prediction_confidence,
            'predicted_start_time', a.predicted_start_time,
            'last_prediction_update', a.last_prediction_update,
            'created_at', a.created_at,
            'updated_at', a.updated_at,
            'is_guest', a.is_guest,
            'original_queue_position', a.original_queue_position,
            'skip_count', a.skip_count,
            'skip_reason', a.skip_reason,
            'override_by', a.override_by,
            'is_walk_in', a.is_walk_in,
            'priority_score', a.priority_score, -- NEW FIELD
            'is_gap_filler', a.is_gap_filler,   -- NEW FIELD
            'patient', CASE 
              WHEN a.is_guest = false AND a.patient_id IS NOT NULL THEN
                (SELECT json_build_object(
                  'id', p.id,
                  'full_name', p.full_name,
                  'phone_number', p.phone_number,
                  'email', p.email
                )
                FROM profiles p
                WHERE p.id = a.patient_id)
              ELSE NULL
            END,
            'guest_patient', CASE
              WHEN a.is_guest = true AND a.guest_patient_id IS NOT NULL THEN
                (SELECT json_build_object(
                  'id', gp.id,
                  'full_name', gp.full_name,
                  'phone_number', gp.phone_number
                )
                FROM guest_patients gp
                WHERE gp.id = a.guest_patient_id)
              ELSE NULL
            END,
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
            COALESCE(a.start_time, a.appointment_date::timestamp) ASC
        )
        FROM appointments a
        WHERE a.clinic_id = v_clinic_id
          AND a.staff_id = p_staff_id
          AND a.appointment_date = v_target_date_date
          AND a.status IN ('scheduled', 'waiting', 'in_progress', 'completed')
      ),
      '[]'::json
    )
  ) INTO v_schedule;

  RETURN v_schedule;
END;
$$;

