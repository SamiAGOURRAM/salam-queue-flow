-- =============================================
-- END DAY RPC FUNCTION
-- World-class ERP pattern for safe day closure
-- Inspired by Epic EpicCare and Cerner PowerChart
-- =============================================

-- Create audit table for day closures
CREATE TABLE IF NOT EXISTS clinic_day_closures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  staff_id UUID NOT NULL REFERENCES clinic_staff(id) ON DELETE SET NULL,
  closure_date DATE NOT NULL,
  performed_by UUID NOT NULL REFERENCES auth.users(id),
  performed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- Summary before closure
  total_appointments INTEGER NOT NULL,
  waiting_count INTEGER NOT NULL,
  in_progress_count INTEGER NOT NULL,
  absent_count INTEGER NOT NULL,
  completed_count INTEGER NOT NULL,
  
  -- Appointments affected
  marked_no_show_ids UUID[] NOT NULL DEFAULT '{}',
  marked_completed_ids UUID[] NOT NULL DEFAULT '{}',
  
  -- Metadata
  reason TEXT,
  notes TEXT,
  can_reopen BOOLEAN NOT NULL DEFAULT true,
  reopened_at TIMESTAMPTZ,
  reopened_by UUID REFERENCES auth.users(id),
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  CONSTRAINT unique_clinic_staff_date UNIQUE (clinic_id, staff_id, closure_date)
);

-- Index for fast lookups
CREATE INDEX idx_day_closures_clinic_date ON clinic_day_closures(clinic_id, closure_date DESC);
CREATE INDEX idx_day_closures_staff_date ON clinic_day_closures(staff_id, closure_date DESC);

-- Enable RLS
ALTER TABLE clinic_day_closures ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Clinic staff can view their day closures"
  ON clinic_day_closures FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM clinic_staff cs
      WHERE cs.clinic_id = clinic_day_closures.clinic_id
      AND cs.user_id = auth.uid()
    )
  );

CREATE POLICY "Clinic staff can insert day closures"
  ON clinic_day_closures FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM clinic_staff cs
      WHERE cs.clinic_id = clinic_day_closures.clinic_id
      AND cs.user_id = auth.uid()
    )
  );

CREATE POLICY "Clinic staff can update their day closures (for reopening)"
  ON clinic_day_closures FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM clinic_staff cs
      WHERE cs.clinic_id = clinic_day_closures.clinic_id
      AND cs.user_id = auth.uid()
    )
  );

-- =============================================
-- MAIN END DAY FUNCTION
-- =============================================

CREATE OR REPLACE FUNCTION end_day_for_staff(
  p_staff_id UUID,
  p_clinic_id UUID,
  p_closure_date DATE,
  p_performed_by UUID,
  p_reason TEXT DEFAULT NULL,
  p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_waiting_count INTEGER;
  v_in_progress_count INTEGER;
  v_absent_count INTEGER;
  v_completed_count INTEGER;
  v_total_count INTEGER;
  v_no_show_ids UUID[];
  v_completed_ids UUID[];
  v_closure_id UUID;
  v_result JSONB;
BEGIN
  -- Lock to prevent concurrent operations
  PERFORM pg_advisory_xact_lock(hashtext(p_staff_id::TEXT || p_closure_date::TEXT));
  
  -- Check if day already closed for this staff
  IF EXISTS (
    SELECT 1 FROM clinic_day_closures
    WHERE staff_id = p_staff_id
    AND closure_date = p_closure_date
    AND reopened_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Day already closed for this staff member. Use reopen function first.';
  END IF;
  
  -- Get summary counts BEFORE changes
  SELECT
    COUNT(*) FILTER (WHERE status IN ('waiting', 'scheduled')),
    COUNT(*) FILTER (WHERE status = 'in_progress'),
    COUNT(*) FILTER (WHERE skip_reason = 'patient_absent' AND status != 'no_show'),
    COUNT(*) FILTER (WHERE status = 'completed'),
    COUNT(*)
  INTO
    v_waiting_count,
    v_in_progress_count,
    v_absent_count,
    v_completed_count,
    v_total_count
  FROM appointments
  WHERE clinic_id = p_clinic_id
  AND staff_id = p_staff_id
  AND appointment_date = p_closure_date;
  
  -- If no appointments, just record the closure
  IF v_total_count = 0 THEN
    INSERT INTO clinic_day_closures (
      clinic_id, staff_id, closure_date, performed_by,
      total_appointments, waiting_count, in_progress_count,
      absent_count, completed_count, reason, notes
    ) VALUES (
      p_clinic_id, p_staff_id, p_closure_date, p_performed_by,
      0, 0, 0, 0, 0, p_reason, p_notes
    )
    RETURNING id INTO v_closure_id;
    
    RETURN jsonb_build_object(
      'success', true,
      'closureId', v_closure_id,
      'message', 'Day closed successfully (no appointments)',
      'summary', jsonb_build_object(
        'totalAppointments', 0,
        'markedNoShow', 0,
        'markedCompleted', 0
      )
    );
  END IF;
  
  -- ============================================
  -- CRITICAL SECTION: Update appointment statuses
  -- ============================================
  
  -- 1. Mark WAITING/SCHEDULED as NO_SHOW
  WITH updated_waiting AS (
    UPDATE appointments
    SET 
      status = 'no_show',
      actual_end_time = NOW(),
      updated_at = NOW()
    WHERE clinic_id = p_clinic_id
    AND staff_id = p_staff_id
    AND appointment_date = p_closure_date
    AND status IN ('waiting', 'scheduled')
    RETURNING id
  )
  SELECT ARRAY_AGG(id) INTO v_no_show_ids FROM updated_waiting;
  
  -- 2. Mark IN_PROGRESS as COMPLETED
  WITH updated_in_progress AS (
    UPDATE appointments
    SET 
      status = 'completed',
      actual_end_time = NOW(),
      updated_at = NOW()
    WHERE clinic_id = p_clinic_id
    AND staff_id = p_staff_id
    AND appointment_date = p_closure_date
    AND status = 'in_progress'
    RETURNING id
  )
  SELECT ARRAY_AGG(id) INTO v_completed_ids FROM updated_in_progress;
  
  -- 3. Mark ABSENT patients as NO_SHOW (if not already)
  UPDATE appointments
  SET 
    status = 'no_show',
    actual_end_time = NOW(),
    updated_at = NOW()
  WHERE clinic_id = p_clinic_id
  AND staff_id = p_staff_id
  AND appointment_date = p_closure_date
  AND skip_reason = 'patient_absent'
  AND status != 'no_show';
  
  -- Handle NULL arrays
  v_no_show_ids := COALESCE(v_no_show_ids, '{}');
  v_completed_ids := COALESCE(v_completed_ids, '{}');
  
  -- ============================================
  -- AUDIT: Record the closure
  -- ============================================
  
  INSERT INTO clinic_day_closures (
    clinic_id, staff_id, closure_date, performed_by,
    total_appointments, waiting_count, in_progress_count,
    absent_count, completed_count,
    marked_no_show_ids, marked_completed_ids,
    reason, notes
  ) VALUES (
    p_clinic_id, p_staff_id, p_closure_date, p_performed_by,
    v_total_count, v_waiting_count, v_in_progress_count,
    v_absent_count, v_completed_count,
    v_no_show_ids, v_completed_ids,
    p_reason, p_notes
  )
  RETURNING id INTO v_closure_id;
  
  -- Build result
  v_result := jsonb_build_object(
    'success', true,
    'closureId', v_closure_id,
    'message', 'Day closed successfully',
    'summary', jsonb_build_object(
      'totalAppointments', v_total_count,
      'markedNoShow', COALESCE(array_length(v_no_show_ids, 1), 0),
      'markedCompleted', COALESCE(array_length(v_completed_ids, 1), 0),
      'previousCounts', jsonb_build_object(
        'waiting', v_waiting_count,
        'inProgress', v_in_progress_count,
        'absent', v_absent_count,
        'completed', v_completed_count
      )
    ),
    'affectedAppointments', jsonb_build_object(
      'noShowIds', v_no_show_ids,
      'completedIds', v_completed_ids
    )
  );
  
  RETURN v_result;
  
EXCEPTION
  WHEN OTHERS THEN
    RAISE EXCEPTION 'End day failed: %', SQLERRM;
END;
$$;

-- =============================================
-- REOPEN DAY FUNCTION (for emergency rollback)
-- =============================================

CREATE OR REPLACE FUNCTION reopen_day_for_staff(
  p_closure_id UUID,
  p_performed_by UUID,
  p_reason TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_closure RECORD;
  v_restored_count INTEGER := 0;
BEGIN
  -- Get closure record
  SELECT * INTO v_closure
  FROM clinic_day_closures
  WHERE id = p_closure_id
  AND can_reopen = true
  AND reopened_at IS NULL;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Closure not found or cannot be reopened';
  END IF;
  
  -- Check if user has permission (same clinic)
  IF NOT EXISTS (
    SELECT 1 FROM clinic_staff cs
    WHERE cs.clinic_id = v_closure.clinic_id
    AND cs.user_id = p_performed_by
  ) THEN
    RAISE EXCEPTION 'Permission denied: user not in clinic';
  END IF;
  
  -- Lock to prevent concurrent operations
  PERFORM pg_advisory_xact_lock(hashtext(v_closure.staff_id::TEXT || v_closure.closure_date::TEXT));
  
  -- Restore appointments that were marked no_show
  -- (Only if they haven't been manually changed since)
  WITH restored AS (
    UPDATE appointments
    SET 
      status = 'waiting',
      actual_end_time = NULL,
      updated_at = NOW()
    WHERE id = ANY(v_closure.marked_no_show_ids)
    AND status = 'no_show' -- Only restore if still no_show
    AND updated_at <= v_closure.performed_at + INTERVAL '5 minutes' -- Safety: only if not modified after
    RETURNING id
  )
  SELECT COUNT(*) INTO v_restored_count FROM restored;
  
  -- Mark closure as reopened
  UPDATE clinic_day_closures
  SET 
    reopened_at = NOW(),
    reopened_by = p_performed_by,
    notes = COALESCE(notes, '') || E'\n\nREOPENED: ' || COALESCE(p_reason, 'No reason provided')
  WHERE id = p_closure_id;
  
  RETURN jsonb_build_object(
    'success', true,
    'message', 'Day reopened successfully',
    'restoredCount', v_restored_count,
    'closureDate', v_closure.closure_date
  );
  
EXCEPTION
  WHEN OTHERS THEN
    RAISE EXCEPTION 'Reopen day failed: %', SQLERRM;
END;
$$;

-- =============================================
-- HELPER: Get day closure summary
-- =============================================

CREATE OR REPLACE FUNCTION get_day_closure_preview(
  p_staff_id UUID,
  p_clinic_id UUID,
  p_closure_date DATE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_summary JSONB;
BEGIN
  SELECT jsonb_build_object(
    'totalAppointments', COUNT(*),
    'waiting', COUNT(*) FILTER (WHERE status IN ('waiting', 'scheduled')),
    'inProgress', COUNT(*) FILTER (WHERE status = 'in_progress'),
    'absent', COUNT(*) FILTER (WHERE skip_reason = 'patient_absent' AND status != 'no_show'),
    'completed', COUNT(*) FILTER (WHERE status = 'completed'),
    'alreadyNoShow', COUNT(*) FILTER (WHERE status = 'no_show'),
    'willMarkNoShow', COUNT(*) FILTER (WHERE status IN ('waiting', 'scheduled') OR (skip_reason = 'patient_absent' AND status != 'no_show')),
    'willMarkCompleted', COUNT(*) FILTER (WHERE status = 'in_progress')
  )
  INTO v_summary
  FROM appointments
  WHERE clinic_id = p_clinic_id
  AND staff_id = p_staff_id
  AND appointment_date = p_closure_date;
  
  RETURN v_summary;
END;
$$;

-- Grant permissions
GRANT EXECUTE ON FUNCTION end_day_for_staff TO authenticated;
GRANT EXECUTE ON FUNCTION reopen_day_for_staff TO authenticated;
GRANT EXECUTE ON FUNCTION get_day_closure_preview TO authenticated;

-- Add helpful comments
COMMENT ON FUNCTION end_day_for_staff IS 'Safely closes the day for a staff member, marking waiting/absent as no-show and in-progress as completed. Creates full audit trail.';
COMMENT ON FUNCTION reopen_day_for_staff IS 'Emergency rollback function to reopen a closed day and restore appointments to waiting status.';
COMMENT ON FUNCTION get_day_closure_preview IS 'Preview what will happen when ending the day (read-only, no changes).';
COMMENT ON TABLE clinic_day_closures IS 'Audit trail for day closures with full before/after summary and rollback capability.';
