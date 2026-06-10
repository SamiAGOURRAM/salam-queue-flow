-- =====================================================
-- Queue break mode support (pause/resume with schedule pushback)
-- =====================================================

CREATE TABLE IF NOT EXISTS public.queue_breaks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id UUID NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  staff_id UUID NOT NULL REFERENCES public.clinic_staff(id) ON DELETE CASCADE,
  started_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  reason TEXT,
  duration_minutes INT NOT NULL CHECK (duration_minutes BETWEEN 1 AND 180),
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ends_at TIMESTAMPTZ NOT NULL,
  ended_at TIMESTAMPTZ,
  ended_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  end_reason TEXT,
  pushed_schedule BOOLEAN NOT NULL DEFAULT false,
  shifted_appointments_count INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT queue_breaks_end_after_start CHECK (ends_at > started_at)
);

CREATE INDEX IF NOT EXISTS idx_queue_breaks_active
  ON public.queue_breaks (clinic_id, staff_id, ends_at DESC)
  WHERE ended_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_queue_breaks_staff_started
  ON public.queue_breaks (staff_id, started_at DESC);

CREATE OR REPLACE FUNCTION public._user_can_manage_target_queue_staff(
  p_clinic_id UUID,
  p_staff_id UUID,
  p_user_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_owner_id UUID;
  v_staff_user_id UUID;
  v_is_super_admin BOOLEAN := false;
BEGIN
  IF p_clinic_id IS NULL OR p_staff_id IS NULL OR p_user_id IS NULL THEN
    RETURN false;
  END IF;

  SELECT c.owner_id
  INTO v_owner_id
  FROM public.clinics c
  WHERE c.id = p_clinic_id;

  IF v_owner_id IS NULL THEN
    RETURN false;
  END IF;

  IF v_owner_id = p_user_id THEN
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

  SELECT cs.user_id
  INTO v_staff_user_id
  FROM public.clinic_staff cs
  WHERE cs.id = p_staff_id
    AND cs.clinic_id = p_clinic_id
    AND COALESCE(cs.is_active, true) = true
  LIMIT 1;

  RETURN v_staff_user_id = p_user_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public._user_can_manage_target_queue_staff(UUID, UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public._user_can_manage_target_queue_staff(UUID, UUID, UUID) TO authenticated;

ALTER TABLE public.queue_breaks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Staff can view queue breaks" ON public.queue_breaks;
CREATE POLICY "Staff can view queue breaks"
  ON public.queue_breaks FOR SELECT
  USING (
    public._user_has_clinic_permission(clinic_id, auth.uid(), 'view_queue')
    AND public._user_can_manage_target_queue_staff(clinic_id, staff_id, auth.uid())
  );

DROP POLICY IF EXISTS "Staff can create queue breaks" ON public.queue_breaks;
CREATE POLICY "Staff can create queue breaks"
  ON public.queue_breaks FOR INSERT
  WITH CHECK (
    public._user_has_clinic_permission(clinic_id, auth.uid(), 'manage_queue')
    AND public._user_can_manage_target_queue_staff(clinic_id, staff_id, auth.uid())
    AND started_by = auth.uid()
  );

DROP POLICY IF EXISTS "Staff can update queue breaks" ON public.queue_breaks;
CREATE POLICY "Staff can update queue breaks"
  ON public.queue_breaks FOR UPDATE
  USING (
    public._user_has_clinic_permission(clinic_id, auth.uid(), 'manage_queue')
    AND public._user_can_manage_target_queue_staff(clinic_id, staff_id, auth.uid())
  )
  WITH CHECK (
    public._user_has_clinic_permission(clinic_id, auth.uid(), 'manage_queue')
    AND public._user_can_manage_target_queue_staff(clinic_id, staff_id, auth.uid())
  );

CREATE OR REPLACE FUNCTION public.start_queue_break(
  p_clinic_id UUID,
  p_staff_id UUID,
  p_duration_minutes INT DEFAULT 15,
  p_reason TEXT DEFAULT NULL,
  p_push_schedule BOOLEAN DEFAULT true,
  p_performed_by UUID DEFAULT auth.uid()
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_auth_user_id UUID := auth.uid();
  v_shifted_count INT := 0;
  v_break public.queue_breaks%ROWTYPE;
BEGIN
  IF v_auth_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  IF p_clinic_id IS NULL OR p_staff_id IS NULL THEN
    RAISE EXCEPTION 'clinic_id and staff_id are required';
  END IF;

  IF p_performed_by IS NULL OR p_performed_by <> v_auth_user_id THEN
    RAISE EXCEPTION 'performed_by must match authenticated user' USING ERRCODE = '42501';
  END IF;

  IF p_duration_minutes IS NULL OR p_duration_minutes < 1 OR p_duration_minutes > 180 THEN
    RAISE EXCEPTION 'duration_minutes must be between 1 and 180';
  END IF;

  IF NOT public._user_has_clinic_permission(p_clinic_id, v_auth_user_id, 'manage_queue') THEN
    RAISE EXCEPTION 'You do not have permission to manage the queue' USING ERRCODE = '42501';
  END IF;

  IF NOT public._user_can_manage_target_queue_staff(p_clinic_id, p_staff_id, v_auth_user_id) THEN
    RAISE EXCEPTION 'You are not allowed to manage this provider queue' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.clinic_staff cs
    WHERE cs.id = p_staff_id
      AND cs.clinic_id = p_clinic_id
      AND COALESCE(cs.is_active, true) = true
  ) THEN
    RAISE EXCEPTION 'Staff member is not active in this clinic';
  END IF;

  UPDATE public.queue_breaks qb
  SET
    ended_at = NOW(),
    ended_by = v_auth_user_id,
    end_reason = COALESCE(qb.end_reason, 'Superseded by a new break'),
    updated_at = NOW()
  WHERE qb.clinic_id = p_clinic_id
    AND qb.staff_id = p_staff_id
    AND qb.ended_at IS NULL
    AND qb.ends_at > NOW();

  IF COALESCE(p_push_schedule, true) THEN
    WITH shifted AS (
      UPDATE public.appointments a
      SET
        scheduled_time = CASE
          WHEN a.scheduled_time ~ '^[0-9]{1,2}:[0-9]{2}(:[0-9]{2})?$' THEN to_char(
            (
              substring(a.scheduled_time FROM '^[0-9]{1,2}:[0-9]{2}')::time
              + make_interval(mins => p_duration_minutes)
            )::time,
            'HH24:MI'
          )
          ELSE a.scheduled_time
        END,
        predicted_start_time = CASE
          WHEN a.predicted_start_time IS NULL THEN NULL
          ELSE a.predicted_start_time + make_interval(mins => p_duration_minutes)
        END,
        predicted_wait_time = CASE
          WHEN a.predicted_wait_time IS NULL THEN NULL
          ELSE GREATEST(0, a.predicted_wait_time + p_duration_minutes)
        END,
        updated_at = NOW()
      WHERE a.clinic_id = p_clinic_id
        AND a.staff_id = p_staff_id
        AND a.appointment_date = CURRENT_DATE
        AND a.status IN ('scheduled', 'waiting')
      RETURNING 1
    )
    SELECT COUNT(*)
    INTO v_shifted_count
    FROM shifted;
  END IF;

  INSERT INTO public.queue_breaks (
    clinic_id,
    staff_id,
    started_by,
    reason,
    duration_minutes,
    started_at,
    ends_at,
    pushed_schedule,
    shifted_appointments_count,
    created_at,
    updated_at
  )
  VALUES (
    p_clinic_id,
    p_staff_id,
    v_auth_user_id,
    NULLIF(TRIM(COALESCE(p_reason, '')), ''),
    p_duration_minutes,
    NOW(),
    NOW() + make_interval(mins => p_duration_minutes),
    COALESCE(p_push_schedule, true),
    v_shifted_count,
    NOW(),
    NOW()
  )
  RETURNING * INTO v_break;

  RETURN jsonb_build_object(
    'breakId', v_break.id,
    'clinicId', v_break.clinic_id,
    'staffId', v_break.staff_id,
    'startedBy', v_break.started_by,
    'reason', v_break.reason,
    'durationMinutes', v_break.duration_minutes,
    'startedAt', v_break.started_at,
    'endsAt', v_break.ends_at,
    'remainingSeconds', GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (v_break.ends_at - NOW())))::INT),
    'pushedSchedule', v_break.pushed_schedule,
    'shiftedAppointmentsCount', v_break.shifted_appointments_count
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.end_queue_break(
  p_clinic_id UUID,
  p_staff_id UUID,
  p_reason TEXT DEFAULT NULL,
  p_performed_by UUID DEFAULT auth.uid()
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_auth_user_id UUID := auth.uid();
  v_break public.queue_breaks%ROWTYPE;
BEGIN
  IF v_auth_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  IF p_clinic_id IS NULL OR p_staff_id IS NULL THEN
    RAISE EXCEPTION 'clinic_id and staff_id are required';
  END IF;

  IF p_performed_by IS NULL OR p_performed_by <> v_auth_user_id THEN
    RAISE EXCEPTION 'performed_by must match authenticated user' USING ERRCODE = '42501';
  END IF;

  IF NOT public._user_has_clinic_permission(p_clinic_id, v_auth_user_id, 'manage_queue') THEN
    RAISE EXCEPTION 'You do not have permission to manage the queue' USING ERRCODE = '42501';
  END IF;

  IF NOT public._user_can_manage_target_queue_staff(p_clinic_id, p_staff_id, v_auth_user_id) THEN
    RAISE EXCEPTION 'You are not allowed to manage this provider queue' USING ERRCODE = '42501';
  END IF;

  WITH target AS (
    SELECT qb.id
    FROM public.queue_breaks qb
    WHERE qb.clinic_id = p_clinic_id
      AND qb.staff_id = p_staff_id
      AND qb.ended_at IS NULL
    ORDER BY qb.started_at DESC
    LIMIT 1
  ),
  updated AS (
    UPDATE public.queue_breaks qb
    SET
      ended_at = NOW(),
      ended_by = v_auth_user_id,
      end_reason = COALESCE(NULLIF(TRIM(COALESCE(p_reason, '')), ''), qb.end_reason),
      updated_at = NOW()
    WHERE qb.id IN (SELECT id FROM target)
    RETURNING qb.*
  )
  SELECT *
  INTO v_break
  FROM updated;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  RETURN jsonb_build_object(
    'breakId', v_break.id,
    'clinicId', v_break.clinic_id,
    'staffId', v_break.staff_id,
    'startedBy', v_break.started_by,
    'reason', v_break.reason,
    'durationMinutes', v_break.duration_minutes,
    'startedAt', v_break.started_at,
    'endsAt', v_break.ends_at,
    'endedAt', v_break.ended_at,
    'remainingSeconds', 0,
    'pushedSchedule', v_break.pushed_schedule,
    'shiftedAppointmentsCount', v_break.shifted_appointments_count
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_active_queue_break(
  p_clinic_id UUID,
  p_staff_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_auth_user_id UUID := auth.uid();
  v_break public.queue_breaks%ROWTYPE;
BEGIN
  IF v_auth_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  IF p_clinic_id IS NULL OR p_staff_id IS NULL THEN
    RAISE EXCEPTION 'clinic_id and staff_id are required';
  END IF;

  IF NOT public._user_has_clinic_permission(p_clinic_id, v_auth_user_id, 'view_queue') THEN
    RAISE EXCEPTION 'You do not have permission to view queue status' USING ERRCODE = '42501';
  END IF;

  IF NOT public._user_can_manage_target_queue_staff(p_clinic_id, p_staff_id, v_auth_user_id) THEN
    RAISE EXCEPTION 'You are not allowed to view this provider queue' USING ERRCODE = '42501';
  END IF;

  SELECT qb.*
  INTO v_break
  FROM public.queue_breaks qb
  WHERE qb.clinic_id = p_clinic_id
    AND qb.staff_id = p_staff_id
    AND qb.ended_at IS NULL
    AND qb.ends_at > NOW()
  ORDER BY qb.started_at DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  RETURN jsonb_build_object(
    'breakId', v_break.id,
    'clinicId', v_break.clinic_id,
    'staffId', v_break.staff_id,
    'startedBy', v_break.started_by,
    'reason', v_break.reason,
    'durationMinutes', v_break.duration_minutes,
    'startedAt', v_break.started_at,
    'endsAt', v_break.ends_at,
    'remainingSeconds', GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (v_break.ends_at - NOW())))::INT),
    'pushedSchedule', v_break.pushed_schedule,
    'shiftedAppointmentsCount', v_break.shifted_appointments_count
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.start_queue_break(UUID, UUID, INT, TEXT, BOOLEAN, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.start_queue_break(UUID, UUID, INT, TEXT, BOOLEAN, UUID) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.end_queue_break(UUID, UUID, TEXT, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.end_queue_break(UUID, UUID, TEXT, UUID) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.get_active_queue_break(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_active_queue_break(UUID, UUID) TO authenticated;
