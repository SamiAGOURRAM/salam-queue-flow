-- =====================================================
-- Per-doctor activity report for clinic owners.
-- =====================================================
-- Returns, per doctor (clinic_staff row), the volume and timing
-- of appointments in a given date window. Uses `actual_duration`
-- when available, else derives from `actual_end_time - checked_in_at`.
-- =====================================================

CREATE OR REPLACE FUNCTION public.get_doctor_activity_report(
  p_clinic_id UUID,
  p_from_date DATE,
  p_to_date DATE
)
RETURNS TABLE (
  staff_id UUID,
  doctor_name TEXT,
  specialization TEXT,
  completed_count INTEGER,
  in_progress_count INTEGER,
  cancelled_count INTEGER,
  no_show_count INTEGER,
  avg_duration_minutes NUMERIC,
  total_patients INTEGER
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_clinic_id IS NULL OR p_from_date IS NULL OR p_to_date IS NULL THEN
    RAISE EXCEPTION 'clinic_id, from_date, and to_date are required';
  END IF;

  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  IF NOT public._user_has_clinic_permission(p_clinic_id, auth.uid(), 'view_analytics') THEN
    RAISE EXCEPTION 'You do not have permission to view clinic analytics' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH doctors AS (
    SELECT
      cs.id AS staff_id,
      COALESCE(p.full_name, 'Doctor') AS doctor_name,
      cs.specialization
    FROM public.clinic_staff cs
    LEFT JOIN public.profiles p ON p.id = cs.user_id
    WHERE cs.clinic_id = p_clinic_id
      AND COALESCE(cs.is_active, true) = true
      AND LOWER(COALESCE(cs.role, '')) = 'doctor'
  ),
  appt_stats AS (
    SELECT
      a.staff_id,
      COUNT(*) FILTER (WHERE a.status = 'completed')::INTEGER AS completed_count,
      COUNT(*) FILTER (WHERE a.status = 'in_progress')::INTEGER AS in_progress_count,
      COUNT(*) FILTER (WHERE a.status = 'cancelled')::INTEGER AS cancelled_count,
      COUNT(*) FILTER (WHERE a.status = 'no_show')::INTEGER AS no_show_count,
      COUNT(*)::INTEGER AS total_patients,
      AVG(
        CASE
          WHEN a.status = 'completed' AND a.actual_duration IS NOT NULL
            THEN a.actual_duration::NUMERIC
          WHEN a.status = 'completed'
             AND a.actual_end_time IS NOT NULL
             AND a.checked_in_at IS NOT NULL
            THEN EXTRACT(EPOCH FROM (a.actual_end_time - a.checked_in_at)) / 60.0
          ELSE NULL
        END
      ) AS avg_duration_minutes
    FROM public.appointments a
    WHERE a.clinic_id = p_clinic_id
      AND a.appointment_date BETWEEN p_from_date AND p_to_date
    GROUP BY a.staff_id
  )
  SELECT
    d.staff_id,
    d.doctor_name,
    d.specialization,
    COALESCE(s.completed_count, 0),
    COALESCE(s.in_progress_count, 0),
    COALESCE(s.cancelled_count, 0),
    COALESCE(s.no_show_count, 0),
    ROUND(s.avg_duration_minutes, 1),
    COALESCE(s.total_patients, 0)
  FROM doctors d
  LEFT JOIN appt_stats s ON s.staff_id = d.staff_id
  ORDER BY COALESCE(s.completed_count, 0) DESC, d.doctor_name ASC;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_doctor_activity_report(UUID, DATE, DATE) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_doctor_activity_report(UUID, DATE, DATE) TO authenticated;
