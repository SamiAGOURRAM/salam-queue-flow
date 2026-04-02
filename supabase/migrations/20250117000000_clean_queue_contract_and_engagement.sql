-- Migration: Clean queue contract + engagement schema
-- Purpose:
-- 1) Enforce queue_mode as the only schedule mode contract key in schedule RPC payloads.
-- 2) Add production-grade favorites and ratings schema with stats views.

-- =====================================================
-- 1. QUEUE CONTRACT: queue_mode only
-- =====================================================

CREATE OR REPLACE FUNCTION public.get_daily_schedule_for_clinic(
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
  v_effective_mode := public.get_effective_queue_mode(p_clinic_id, p_target_date);

  SELECT json_build_object(
    'queue_mode', v_effective_mode,
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
                'display_name', p.display_name
              )
              FROM public.patients p
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
              FROM public.clinics c
              WHERE c.id = a.clinic_id
            )
          )
          ORDER BY
            a.queue_position NULLS LAST,
            COALESCE(a.scheduled_time, '00:00') ASC,
            a.created_at ASC
        )
        FROM public.appointments a
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

CREATE OR REPLACE FUNCTION public.get_daily_schedule_for_staff(
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
  FROM public.clinic_staff
  WHERE id = p_staff_id;

  IF v_clinic_id IS NULL THEN
    RAISE EXCEPTION 'Staff member not found: %', p_staff_id;
  END IF;

  v_target_date := p_target_date::date;
  v_effective_mode := public.get_effective_queue_mode(v_clinic_id, v_target_date);

  SELECT json_build_object(
    'queue_mode', v_effective_mode,
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
                'display_name', p.display_name
              )
              FROM public.patients p
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
              FROM public.clinics c
              WHERE c.id = a.clinic_id
            )
          )
          ORDER BY
            a.queue_position NULLS LAST,
            COALESCE(a.scheduled_time, '00:00') ASC,
            a.created_at ASC
        )
        FROM public.appointments a
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

-- =====================================================
-- 2. ENGAGEMENT TABLES
-- =====================================================

CREATE TABLE IF NOT EXISTS public.patient_favorites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  patient_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT patient_favorites_clinic_patient_unique UNIQUE (clinic_id, patient_id)
);

CREATE TABLE IF NOT EXISTS public.clinic_ratings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  patient_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  rating int NOT NULL CHECK (rating BETWEEN 1 AND 5),
  review_text text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT clinic_ratings_clinic_patient_unique UNIQUE (clinic_id, patient_id),
  CONSTRAINT clinic_ratings_review_length_check CHECK (review_text IS NULL OR length(review_text) <= 500)
);

CREATE INDEX IF NOT EXISTS idx_patient_favorites_patient_id
  ON public.patient_favorites(patient_id);

CREATE INDEX IF NOT EXISTS idx_patient_favorites_clinic_id
  ON public.patient_favorites(clinic_id);

CREATE INDEX IF NOT EXISTS idx_clinic_ratings_clinic_id
  ON public.clinic_ratings(clinic_id);

CREATE INDEX IF NOT EXISTS idx_clinic_ratings_patient_id
  ON public.clinic_ratings(patient_id);

-- Keep updated_at current
DROP TRIGGER IF EXISTS update_patient_favorites_updated_at ON public.patient_favorites;
CREATE TRIGGER update_patient_favorites_updated_at
  BEFORE UPDATE ON public.patient_favorites
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_clinic_ratings_updated_at ON public.clinic_ratings;
CREATE TRIGGER update_clinic_ratings_updated_at
  BEFORE UPDATE ON public.clinic_ratings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =====================================================
-- 3. ENGAGEMENT STATS VIEWS
-- =====================================================

CREATE OR REPLACE VIEW public.clinic_favorite_stats AS
SELECT
  pf.clinic_id,
  COUNT(*)::int AS total_favorites
FROM public.patient_favorites pf
GROUP BY pf.clinic_id;

CREATE OR REPLACE VIEW public.clinic_rating_stats AS
SELECT
  cr.clinic_id,
  ROUND(AVG(cr.rating)::numeric, 2) AS average_rating,
  COUNT(*)::int AS total_ratings,
  COUNT(*) FILTER (WHERE cr.rating = 5)::int AS five_star_count,
  COUNT(*) FILTER (WHERE cr.rating = 4)::int AS four_star_count,
  COUNT(*) FILTER (WHERE cr.rating = 3)::int AS three_star_count,
  COUNT(*) FILTER (WHERE cr.rating = 2)::int AS two_star_count,
  COUNT(*) FILTER (WHERE cr.rating = 1)::int AS one_star_count
FROM public.clinic_ratings cr
GROUP BY cr.clinic_id;

-- =====================================================
-- 4. RLS + GRANTS
-- =====================================================

ALTER TABLE public.patient_favorites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clinic_ratings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS patient_favorites_select_own ON public.patient_favorites;
CREATE POLICY patient_favorites_select_own
  ON public.patient_favorites FOR SELECT
  USING (auth.uid() = patient_id);

DROP POLICY IF EXISTS patient_favorites_insert_own ON public.patient_favorites;
CREATE POLICY patient_favorites_insert_own
  ON public.patient_favorites FOR INSERT
  WITH CHECK (auth.uid() = patient_id);

DROP POLICY IF EXISTS patient_favorites_update_own ON public.patient_favorites;
CREATE POLICY patient_favorites_update_own
  ON public.patient_favorites FOR UPDATE
  USING (auth.uid() = patient_id)
  WITH CHECK (auth.uid() = patient_id);

DROP POLICY IF EXISTS patient_favorites_delete_own ON public.patient_favorites;
CREATE POLICY patient_favorites_delete_own
  ON public.patient_favorites FOR DELETE
  USING (auth.uid() = patient_id);

DROP POLICY IF EXISTS clinic_ratings_select_public ON public.clinic_ratings;
CREATE POLICY clinic_ratings_select_public
  ON public.clinic_ratings FOR SELECT
  USING (true);

DROP POLICY IF EXISTS clinic_ratings_insert_own ON public.clinic_ratings;
CREATE POLICY clinic_ratings_insert_own
  ON public.clinic_ratings FOR INSERT
  WITH CHECK (auth.uid() = patient_id);

DROP POLICY IF EXISTS clinic_ratings_update_own ON public.clinic_ratings;
CREATE POLICY clinic_ratings_update_own
  ON public.clinic_ratings FOR UPDATE
  USING (auth.uid() = patient_id)
  WITH CHECK (auth.uid() = patient_id);

DROP POLICY IF EXISTS clinic_ratings_delete_own ON public.clinic_ratings;
CREATE POLICY clinic_ratings_delete_own
  ON public.clinic_ratings FOR DELETE
  USING (auth.uid() = patient_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.patient_favorites TO authenticated;
GRANT SELECT ON TABLE public.clinic_ratings TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON TABLE public.clinic_ratings TO authenticated;
GRANT SELECT ON TABLE public.clinic_favorite_stats TO anon, authenticated;
GRANT SELECT ON TABLE public.clinic_rating_stats TO anon, authenticated;
