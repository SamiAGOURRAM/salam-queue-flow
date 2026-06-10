-- Persisted day-closure reports for owner/staff historical review.

CREATE TABLE IF NOT EXISTS public.clinic_day_closure_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id UUID NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  staff_id UUID NOT NULL REFERENCES public.clinic_staff(id) ON DELETE RESTRICT,
  closure_date DATE NOT NULL,
  closed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  closed_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  reason TEXT,
  notes TEXT,
  total_appointments INT NOT NULL DEFAULT 0 CHECK (total_appointments >= 0),
  waiting_count INT NOT NULL DEFAULT 0 CHECK (waiting_count >= 0),
  in_progress_count INT NOT NULL DEFAULT 0 CHECK (in_progress_count >= 0),
  absent_count INT NOT NULL DEFAULT 0 CHECK (absent_count >= 0),
  completed_count INT NOT NULL DEFAULT 0 CHECK (completed_count >= 0),
  already_no_show_count INT NOT NULL DEFAULT 0 CHECK (already_no_show_count >= 0),
  marked_no_show_count INT NOT NULL DEFAULT 0 CHECK (marked_no_show_count >= 0),
  marked_completed_count INT NOT NULL DEFAULT 0 CHECK (marked_completed_count >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT clinic_day_closure_reports_unique_scope UNIQUE (clinic_id, staff_id, closure_date)
);

CREATE INDEX IF NOT EXISTS idx_day_closure_reports_clinic_date
  ON public.clinic_day_closure_reports(clinic_id, closure_date DESC, closed_at DESC);

CREATE INDEX IF NOT EXISTS idx_day_closure_reports_clinic_staff_date
  ON public.clinic_day_closure_reports(clinic_id, staff_id, closure_date DESC);

DROP TRIGGER IF EXISTS set_updated_at_clinic_day_closure_reports ON public.clinic_day_closure_reports;
CREATE TRIGGER set_updated_at_clinic_day_closure_reports
  BEFORE UPDATE ON public.clinic_day_closure_reports
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.clinic_day_closure_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Staff can view day closure reports" ON public.clinic_day_closure_reports;
CREATE POLICY "Staff can view day closure reports"
  ON public.clinic_day_closure_reports
  FOR SELECT
  USING (public._user_has_clinic_permission(clinic_id, auth.uid(), 'view_queue'));

GRANT SELECT ON public.clinic_day_closure_reports TO authenticated;

CREATE OR REPLACE FUNCTION public._user_can_access_day_closure_scope(
  p_clinic_id UUID,
  p_staff_id UUID,
  p_user_id UUID,
  p_clinic_wide BOOLEAN DEFAULT false
)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_owner BOOLEAN := false;
  v_is_super_admin BOOLEAN := false;
  v_matches_staff BOOLEAN := false;
BEGIN
  IF p_clinic_id IS NULL OR p_user_id IS NULL THEN
    RETURN false;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.clinics c
    WHERE c.id = p_clinic_id
      AND c.owner_id = p_user_id
  )
  INTO v_is_owner;

  IF v_is_owner THEN
    RETURN true;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    WHERE ur.user_id = p_user_id
      AND ur.clinic_id = p_clinic_id
      AND ur.role = 'super_admin'
  )
  INTO v_is_super_admin;

  IF v_is_super_admin THEN
    RETURN true;
  END IF;

  IF p_clinic_wide THEN
    RETURN false;
  END IF;

  IF p_staff_id IS NULL THEN
    RETURN false;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.clinic_staff cs
    WHERE cs.id = p_staff_id
      AND cs.clinic_id = p_clinic_id
      AND cs.user_id = p_user_id
      AND COALESCE(cs.is_active, true) = true
  )
  INTO v_matches_staff;

  RETURN v_matches_staff;
END;
$$;

REVOKE EXECUTE ON FUNCTION public._user_can_access_day_closure_scope(UUID, UUID, UUID, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public._user_can_access_day_closure_scope(UUID, UUID, UUID, BOOLEAN) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_day_closure_preview(
  p_staff_id UUID,
  p_clinic_id UUID,
  p_closure_date DATE
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_preview RECORD;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  IF p_staff_id IS NULL OR p_clinic_id IS NULL OR p_closure_date IS NULL THEN
    RAISE EXCEPTION 'staff_id, clinic_id, and closure_date are required';
  END IF;

  IF NOT public._user_has_clinic_permission(p_clinic_id, v_user_id, 'manage_queue') THEN
    RAISE EXCEPTION 'You do not have permission to close queue days' USING ERRCODE = '42501';
  END IF;

  IF NOT public._user_can_access_day_closure_scope(p_clinic_id, p_staff_id, v_user_id, false) THEN
    RAISE EXCEPTION 'You are not allowed to close this provider queue' USING ERRCODE = '42501';
  END IF;

  SELECT
    COUNT(*)::INT AS total_appointments,
    COUNT(*) FILTER (WHERE a.status = 'waiting')::INT AS waiting,
    COUNT(*) FILTER (WHERE a.status = 'in_progress')::INT AS in_progress,
    COUNT(*) FILTER (WHERE a.status = 'completed')::INT AS completed,
    COUNT(*) FILTER (WHERE a.status = 'no_show')::INT AS already_no_show,
    COUNT(*) FILTER (
      WHERE a.status IN ('scheduled', 'waiting')
        AND a.skip_reason = 'patient_absent'
        AND a.returned_at IS NULL
    )::INT AS absent,
    COUNT(*) FILTER (WHERE a.status IN ('scheduled', 'waiting'))::INT AS will_mark_no_show,
    COUNT(*) FILTER (WHERE a.status = 'in_progress')::INT AS will_mark_completed
  INTO v_preview
  FROM public.appointments a
  WHERE a.clinic_id = p_clinic_id
    AND a.staff_id = p_staff_id
    AND a.appointment_date = p_closure_date;

  RETURN jsonb_build_object(
    'totalAppointments', COALESCE(v_preview.total_appointments, 0),
    'waiting', COALESCE(v_preview.waiting, 0),
    'inProgress', COALESCE(v_preview.in_progress, 0),
    'absent', COALESCE(v_preview.absent, 0),
    'completed', COALESCE(v_preview.completed, 0),
    'alreadyNoShow', COALESCE(v_preview.already_no_show, 0),
    'willMarkNoShow', COALESCE(v_preview.will_mark_no_show, 0),
    'willMarkCompleted', COALESCE(v_preview.will_mark_completed, 0)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.end_day_for_staff(
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
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_preview JSONB;
  v_marked_completed INT := 0;
  v_marked_no_show INT := 0;
  v_report_id UUID;
  v_closed_at TIMESTAMPTZ;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  IF p_performed_by IS NULL OR p_performed_by <> v_user_id THEN
    RAISE EXCEPTION 'performed_by must match authenticated user' USING ERRCODE = '42501';
  END IF;

  IF p_staff_id IS NULL OR p_clinic_id IS NULL OR p_closure_date IS NULL THEN
    RAISE EXCEPTION 'staff_id, clinic_id, and closure_date are required';
  END IF;

  IF NOT public._user_has_clinic_permission(p_clinic_id, v_user_id, 'manage_queue') THEN
    RAISE EXCEPTION 'You do not have permission to close queue days' USING ERRCODE = '42501';
  END IF;

  IF NOT public._user_can_access_day_closure_scope(p_clinic_id, p_staff_id, v_user_id, false) THEN
    RAISE EXCEPTION 'You are not allowed to close this provider queue' USING ERRCODE = '42501';
  END IF;

  v_preview := public.get_day_closure_preview(p_staff_id, p_clinic_id, p_closure_date);

  WITH completed_update AS (
    UPDATE public.appointments a
    SET
      status = 'completed',
      actual_end_time = COALESCE(a.actual_end_time, NOW()),
      updated_at = NOW()
    WHERE a.clinic_id = p_clinic_id
      AND a.staff_id = p_staff_id
      AND a.appointment_date = p_closure_date
      AND a.status = 'in_progress'
    RETURNING 1
  )
  SELECT COUNT(*)::INT INTO v_marked_completed FROM completed_update;

  WITH no_show_update AS (
    UPDATE public.appointments a
    SET
      status = 'no_show',
      cancellation_reason = COALESCE(a.cancellation_reason, 'auto_day_closure_no_show'),
      updated_at = NOW()
    WHERE a.clinic_id = p_clinic_id
      AND a.staff_id = p_staff_id
      AND a.appointment_date = p_closure_date
      AND a.status IN ('scheduled', 'waiting')
    RETURNING 1
  )
  SELECT COUNT(*)::INT INTO v_marked_no_show FROM no_show_update;

  PERFORM public.recalculate_queue_positions(p_clinic_id, p_closure_date);

  INSERT INTO public.clinic_day_closure_reports (
    clinic_id,
    staff_id,
    closure_date,
    closed_at,
    closed_by,
    reason,
    notes,
    total_appointments,
    waiting_count,
    in_progress_count,
    absent_count,
    completed_count,
    already_no_show_count,
    marked_no_show_count,
    marked_completed_count
  )
  VALUES (
    p_clinic_id,
    p_staff_id,
    p_closure_date,
    NOW(),
    v_user_id,
    NULLIF(BTRIM(COALESCE(p_reason, '')), ''),
    NULLIF(BTRIM(COALESCE(p_notes, '')), ''),
    COALESCE((v_preview ->> 'totalAppointments')::INT, 0),
    COALESCE((v_preview ->> 'waiting')::INT, 0),
    COALESCE((v_preview ->> 'inProgress')::INT, 0),
    COALESCE((v_preview ->> 'absent')::INT, 0),
    COALESCE((v_preview ->> 'completed')::INT, 0),
    COALESCE((v_preview ->> 'alreadyNoShow')::INT, 0),
    COALESCE(v_marked_no_show, 0),
    COALESCE(v_marked_completed, 0)
  )
  ON CONFLICT (clinic_id, staff_id, closure_date)
  DO UPDATE SET
    closed_at = EXCLUDED.closed_at,
    closed_by = EXCLUDED.closed_by,
    reason = EXCLUDED.reason,
    notes = EXCLUDED.notes,
    total_appointments = EXCLUDED.total_appointments,
    waiting_count = EXCLUDED.waiting_count,
    in_progress_count = EXCLUDED.in_progress_count,
    absent_count = EXCLUDED.absent_count,
    completed_count = EXCLUDED.completed_count,
    already_no_show_count = EXCLUDED.already_no_show_count,
    marked_no_show_count = EXCLUDED.marked_no_show_count,
    marked_completed_count = EXCLUDED.marked_completed_count,
    updated_at = NOW()
  RETURNING id, closed_at INTO v_report_id, v_closed_at;

  RETURN jsonb_build_object(
    'reportId', v_report_id,
    'closedAt', v_closed_at,
    'closureDate', p_closure_date,
    'summary', jsonb_build_object(
      'markedNoShow', COALESCE(v_marked_no_show, 0),
      'markedCompleted', COALESCE(v_marked_completed, 0)
    ),
    'preview', v_preview
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_day_closure_history(
  p_clinic_id UUID,
  p_staff_id UUID DEFAULT NULL,
  p_limit INT DEFAULT 20,
  p_offset INT DEFAULT 0
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_effective_staff_id UUID := p_staff_id;
  v_limit INT := GREATEST(1, LEAST(COALESCE(p_limit, 20), 100));
  v_offset INT := GREATEST(COALESCE(p_offset, 0), 0);
  v_history JSONB;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  IF p_clinic_id IS NULL THEN
    RAISE EXCEPTION 'clinic_id is required';
  END IF;

  IF NOT public._user_has_clinic_permission(p_clinic_id, v_user_id, 'view_queue') THEN
    RAISE EXCEPTION 'You do not have permission to view queue closure history' USING ERRCODE = '42501';
  END IF;

  IF p_staff_id IS NOT NULL THEN
    IF NOT public._user_can_access_day_closure_scope(p_clinic_id, p_staff_id, v_user_id, false) THEN
      RAISE EXCEPTION 'You are not allowed to view this provider closure history' USING ERRCODE = '42501';
    END IF;
  ELSE
    IF NOT public._user_can_access_day_closure_scope(p_clinic_id, NULL, v_user_id, true) THEN
      SELECT cs.id
      INTO v_effective_staff_id
      FROM public.clinic_staff cs
      WHERE cs.clinic_id = p_clinic_id
        AND cs.user_id = v_user_id
        AND COALESCE(cs.is_active, true) = true
      ORDER BY cs.created_at ASC NULLS LAST, cs.id ASC
      LIMIT 1;

      IF v_effective_staff_id IS NULL THEN
        RETURN '[]'::JSONB;
      END IF;
    END IF;
  END IF;

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id', row_data.id,
        'clinicId', row_data.clinic_id,
        'staffId', row_data.staff_id,
        'staffName', row_data.staff_name,
        'closureDate', row_data.closure_date,
        'closedAt', row_data.closed_at,
        'reason', row_data.reason,
        'notes', row_data.notes,
        'summary', jsonb_build_object(
          'totalAppointments', row_data.total_appointments,
          'waiting', row_data.waiting_count,
          'inProgress', row_data.in_progress_count,
          'absent', row_data.absent_count,
          'completed', row_data.completed_count,
          'alreadyNoShow', row_data.already_no_show_count,
          'markedNoShow', row_data.marked_no_show_count,
          'markedCompleted', row_data.marked_completed_count
        )
      )
    ),
    '[]'::JSONB
  )
  INTO v_history
  FROM (
    SELECT
      report.id,
      report.clinic_id,
      report.staff_id,
      profile.full_name AS staff_name,
      report.closure_date,
      report.closed_at,
      report.reason,
      report.notes,
      report.total_appointments,
      report.waiting_count,
      report.in_progress_count,
      report.absent_count,
      report.completed_count,
      report.already_no_show_count,
      report.marked_no_show_count,
      report.marked_completed_count
    FROM public.clinic_day_closure_reports report
    LEFT JOIN public.clinic_staff cs ON cs.id = report.staff_id
    LEFT JOIN public.profiles profile ON profile.id = cs.user_id
    WHERE report.clinic_id = p_clinic_id
      AND (v_effective_staff_id IS NULL OR report.staff_id = v_effective_staff_id)
    ORDER BY report.closure_date DESC, report.closed_at DESC
    LIMIT v_limit
    OFFSET v_offset
  ) AS row_data;

  RETURN v_history;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_day_closure_preview(UUID, UUID, DATE) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_day_closure_preview(UUID, UUID, DATE) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.end_day_for_staff(UUID, UUID, DATE, UUID, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.end_day_for_staff(UUID, UUID, DATE, UUID, TEXT, TEXT) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.get_day_closure_history(UUID, UUID, INT, INT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_day_closure_history(UUID, UUID, INT, INT) TO authenticated;
