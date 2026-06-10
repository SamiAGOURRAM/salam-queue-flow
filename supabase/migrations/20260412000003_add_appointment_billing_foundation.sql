-- =====================================================
-- Phase 49F: Billing and revenue foundation.
-- Adds appointment billing fields + permission-aware payment RPCs.
-- =====================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'appointment_payment_status'
      AND n.nspname = 'public'
  ) THEN
    CREATE TYPE public.appointment_payment_status AS ENUM (
      'unpaid',
      'paid',
      'partially_paid',
      'refunded',
      'waived'
    );
  END IF;
END
$$;

ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS billing_amount NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS currency TEXT,
  ADD COLUMN IF NOT EXISTS payment_status public.appointment_payment_status,
  ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS payment_method TEXT;

UPDATE public.appointments
SET currency = 'MAD'
WHERE currency IS NULL OR BTRIM(currency) = '';

UPDATE public.appointments
SET payment_status = 'unpaid'::public.appointment_payment_status
WHERE payment_status IS NULL;

ALTER TABLE public.appointments
  ALTER COLUMN currency SET DEFAULT 'MAD',
  ALTER COLUMN currency SET NOT NULL,
  ALTER COLUMN payment_status SET DEFAULT 'unpaid'::public.appointment_payment_status,
  ALTER COLUMN payment_status SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'appointments_billing_amount_non_negative'
      AND conrelid = 'public.appointments'::regclass
  ) THEN
    ALTER TABLE public.appointments
      ADD CONSTRAINT appointments_billing_amount_non_negative
      CHECK (billing_amount IS NULL OR billing_amount >= 0);
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'appointments_currency_not_blank'
      AND conrelid = 'public.appointments'::regclass
  ) THEN
    ALTER TABLE public.appointments
      ADD CONSTRAINT appointments_currency_not_blank
      CHECK (BTRIM(currency) <> '');
  END IF;
END
$$;

-- Keep DB defaults aligned with frontend permission keys.
CREATE OR REPLACE FUNCTION public._default_clinic_role_permissions(
  p_base_role TEXT
)
RETURNS JSONB
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN p_base_role = 'doctor' THEN jsonb_build_object(
      'view_dashboard', true,
      'manage_dashboard', false,
      'view_queue', true,
      'manage_queue', true,
      'view_calendar', true,
      'manage_calendar', true,
      'manage_appointments', true,
      'view_patients', true,
      'view_team', true,
      'manage_team', false,
      'view_clinic_settings', true,
      'manage_clinic_settings', false,
      'manage_roles', false,
      'view_medical_records', true,
      'manage_medical_records', true,
      'view_analytics', false,
      'view_billing', false,
      'manage_billing', false
    )
    ELSE jsonb_build_object(
      'view_dashboard', true,
      'manage_dashboard', false,
      'view_queue', true,
      'manage_queue', true,
      'view_calendar', true,
      'manage_calendar', true,
      'manage_appointments', true,
      'view_patients', true,
      'view_team', true,
      'manage_team', false,
      'view_clinic_settings', false,
      'manage_clinic_settings', false,
      'manage_roles', false,
      'view_medical_records', false,
      'manage_medical_records', false,
      'view_analytics', false,
      'view_billing', false,
      'manage_billing', false
    )
  END;
$$;

CREATE OR REPLACE FUNCTION public._resolve_clinic_appointment_type_price(
  p_clinic_id UUID,
  p_appointment_type public.appointment_type
)
RETURNS NUMERIC
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_price NUMERIC;
BEGIN
  IF p_clinic_id IS NULL OR p_appointment_type IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT ROUND((entry ->> 'price')::NUMERIC, 2)
  INTO v_price
  FROM public.clinics c
  CROSS JOIN LATERAL jsonb_array_elements(COALESCE(c.settings -> 'appointment_types', '[]'::jsonb)) entry
  WHERE c.id = p_clinic_id
    AND jsonb_typeof(entry) = 'object'
    AND LOWER(COALESCE(entry ->> 'name', '')) = LOWER(p_appointment_type::TEXT)
    AND COALESCE(entry ->> 'price', '') ~ '^[0-9]+([.][0-9]+)?$'
  LIMIT 1;

  RETURN v_price;
END;
$$;

REVOKE EXECUTE ON FUNCTION public._resolve_clinic_appointment_type_price(UUID, public.appointment_type) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public._resolve_clinic_appointment_type_price(UUID, public.appointment_type) TO authenticated;

CREATE OR REPLACE FUNCTION public._appointments_apply_billing_defaults()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_default_amount NUMERIC;
BEGIN
  IF NEW.currency IS NULL OR BTRIM(NEW.currency) = '' THEN
    NEW.currency := 'MAD';
  ELSE
    NEW.currency := UPPER(BTRIM(NEW.currency));
  END IF;

  IF NEW.billing_amount IS NULL THEN
    v_default_amount := public._resolve_clinic_appointment_type_price(NEW.clinic_id, NEW.appointment_type);
    IF v_default_amount IS NOT NULL THEN
      NEW.billing_amount := v_default_amount;
    END IF;
  ELSE
    NEW.billing_amount := ROUND(NEW.billing_amount, 2);
  END IF;

  IF NEW.payment_status IS NULL THEN
    NEW.payment_status := 'unpaid'::public.appointment_payment_status;
  END IF;

  IF NEW.payment_method IS NOT NULL THEN
    NEW.payment_method := NULLIF(LOWER(BTRIM(NEW.payment_method)), '');
  END IF;

  IF NEW.payment_status = 'paid'::public.appointment_payment_status AND NEW.paid_at IS NULL THEN
    NEW.paid_at := NOW();
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS appointments_apply_billing_defaults ON public.appointments;
CREATE TRIGGER appointments_apply_billing_defaults
  BEFORE INSERT OR UPDATE OF appointment_type, billing_amount, currency, payment_status, payment_method, paid_at
  ON public.appointments
  FOR EACH ROW
  EXECUTE FUNCTION public._appointments_apply_billing_defaults();

-- Backfill amount for legacy appointments from clinic settings where available.
UPDATE public.appointments a
SET billing_amount = public._resolve_clinic_appointment_type_price(a.clinic_id, a.appointment_type)
WHERE a.billing_amount IS NULL;

CREATE OR REPLACE FUNCTION public._appointments_guard_billing_updates()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
BEGIN
  IF NEW.billing_amount IS NOT DISTINCT FROM OLD.billing_amount
    AND NEW.currency IS NOT DISTINCT FROM OLD.currency
    AND NEW.payment_status IS NOT DISTINCT FROM OLD.payment_status
    AND NEW.paid_at IS NOT DISTINCT FROM OLD.paid_at
    AND NEW.payment_method IS NOT DISTINCT FROM OLD.payment_method THEN
    RETURN NEW;
  END IF;

  -- Allow trusted backend/system updates where auth context is absent.
  IF v_user_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NOT public._user_has_clinic_permission(NEW.clinic_id, v_user_id, 'manage_billing') THEN
    RAISE EXCEPTION 'You do not have permission to manage billing' USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS appointments_guard_billing_updates ON public.appointments;
CREATE TRIGGER appointments_guard_billing_updates
  BEFORE UPDATE OF billing_amount, currency, payment_status, paid_at, payment_method
  ON public.appointments
  FOR EACH ROW
  EXECUTE FUNCTION public._appointments_guard_billing_updates();

CREATE OR REPLACE FUNCTION public._appointment_to_queue_json(
  p_appointment_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result JSONB;
BEGIN
  SELECT jsonb_build_object(
    'id', a.id,
    'clinic_id', a.clinic_id,
    'patient_id', a.patient_id,
    'staff_id', a.staff_id,
    'start_time', CASE
      WHEN a.scheduled_time IS NOT NULL THEN (a.appointment_date::text || ' ' || a.scheduled_time)::timestamptz
      ELSE NULL
    END,
    'end_time', CASE
      WHEN a.scheduled_time IS NOT NULL THEN (a.appointment_date::text || ' ' || a.scheduled_time)::timestamptz + make_interval(mins => COALESCE(a.estimated_duration, 15))
      ELSE NULL
    END,
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
    'actual_duration', a.actual_duration,
    'estimated_duration', a.estimated_duration,
    'predicted_wait_time', a.predicted_wait_time,
    'prediction_mode', NULL,
    'prediction_confidence', a.prediction_confidence,
    'predicted_start_time', a.predicted_start_time,
    'last_prediction_update', a.last_prediction_update,
    'created_at', a.created_at,
    'updated_at', a.updated_at,
    'original_queue_position', a.original_queue_position,
    'skip_count', a.skip_count,
    'skip_reason', a.skip_reason,
    'override_by', a.override_by,
    'is_walk_in', a.is_walk_in,
    'priority_score', a.priority_score,
    'is_gap_filler', a.is_gap_filler,
    'promoted_from_waitlist', a.promoted_from_waitlist,
    'queue_status_token', a.queue_status_token,
    'late_arrival_converted', a.late_arrival_converted,
    'original_slot_time', a.original_slot_time,
    'resource_id', a.resource_id,
    'billing_amount', a.billing_amount,
    'currency', a.currency,
    'payment_status', a.payment_status,
    'paid_at', a.paid_at,
    'payment_method', a.payment_method,
    'resource', CASE
      WHEN cr.id IS NULL THEN NULL
      ELSE jsonb_build_object(
        'id', cr.id,
        'name', cr.name,
        'resource_type', cr.resource_type
      )
    END,
    'patient', CASE
      WHEN p.id IS NULL THEN NULL
      ELSE jsonb_build_object('id', p.id, 'display_name', p.display_name)
    END,
    'clinic', jsonb_build_object(
      'id', c.id,
      'name', c.name,
      'specialty', c.specialty,
      'city', c.city,
      'address', c.address,
      'phone', c.phone
    )
  )
  INTO v_result
  FROM public.appointments a
  JOIN public.clinics c ON c.id = a.clinic_id
  LEFT JOIN public.patients p ON p.id = a.patient_id
  LEFT JOIN public.clinic_resources cr ON cr.id = a.resource_id
  WHERE a.id = p_appointment_id;

  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_appointment_payment_status(
  p_appointment_id UUID,
  p_payment_status public.appointment_payment_status,
  p_payment_method TEXT DEFAULT NULL,
  p_paid_at TIMESTAMPTZ DEFAULT NULL,
  p_billing_amount NUMERIC DEFAULT NULL,
  p_currency TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_clinic_id UUID;
  v_normalized_method TEXT := NULLIF(LOWER(BTRIM(COALESCE(p_payment_method, ''))), '');
  v_normalized_currency TEXT := NULLIF(UPPER(BTRIM(COALESCE(p_currency, ''))), '');
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  IF p_appointment_id IS NULL OR p_payment_status IS NULL THEN
    RAISE EXCEPTION 'appointment_id and payment_status are required';
  END IF;

  IF p_billing_amount IS NOT NULL AND p_billing_amount < 0 THEN
    RAISE EXCEPTION 'billing_amount must be non-negative';
  END IF;

  SELECT a.clinic_id
  INTO v_clinic_id
  FROM public.appointments a
  WHERE a.id = p_appointment_id
  FOR UPDATE;

  IF v_clinic_id IS NULL THEN
    RAISE EXCEPTION 'Appointment not found';
  END IF;

  IF NOT public._user_has_clinic_permission(v_clinic_id, v_user_id, 'manage_billing') THEN
    RAISE EXCEPTION 'You do not have permission to manage billing' USING ERRCODE = '42501';
  END IF;

  UPDATE public.appointments a
  SET
    payment_status = p_payment_status,
    payment_method = COALESCE(v_normalized_method, a.payment_method),
    paid_at = CASE
      WHEN p_payment_status = 'paid'::public.appointment_payment_status
        THEN COALESCE(p_paid_at, a.paid_at, NOW())
      WHEN p_paid_at IS NOT NULL
        THEN p_paid_at
      ELSE NULL
    END,
    billing_amount = COALESCE(p_billing_amount, a.billing_amount),
    currency = COALESCE(v_normalized_currency, a.currency, 'MAD'),
    updated_at = NOW()
  WHERE a.id = p_appointment_id;

  RETURN public._appointment_to_queue_json(p_appointment_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.get_clinic_revenue_kpis(
  p_clinic_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_currency TEXT := 'MAD';

  v_day_billed NUMERIC := 0;
  v_day_collected NUMERIC := 0;
  v_day_completed INT := 0;
  v_day_paid INT := 0;

  v_week_billed NUMERIC := 0;
  v_week_collected NUMERIC := 0;
  v_week_completed INT := 0;
  v_week_paid INT := 0;

  v_month_billed NUMERIC := 0;
  v_month_collected NUMERIC := 0;
  v_month_completed INT := 0;
  v_month_paid INT := 0;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  IF p_clinic_id IS NULL THEN
    RAISE EXCEPTION 'clinic_id is required';
  END IF;

  IF NOT public._user_has_clinic_permission(p_clinic_id, v_user_id, 'view_billing') THEN
    RAISE EXCEPTION 'You do not have permission to view billing metrics' USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(a.currency, 'MAD')
  INTO v_currency
  FROM public.appointments a
  WHERE a.clinic_id = p_clinic_id
  ORDER BY a.updated_at DESC
  LIMIT 1;

  SELECT
    COALESCE(SUM(COALESCE(a.billing_amount, 0)), 0),
    COALESCE(SUM(CASE WHEN a.payment_status = 'paid'::public.appointment_payment_status THEN COALESCE(a.billing_amount, 0) ELSE 0 END), 0),
    COUNT(*)::INT,
    COUNT(*) FILTER (WHERE a.payment_status = 'paid'::public.appointment_payment_status)::INT
  INTO v_day_billed, v_day_collected, v_day_completed, v_day_paid
  FROM public.appointments a
  WHERE a.clinic_id = p_clinic_id
    AND a.status = 'completed'::public.appointment_status
    AND a.appointment_date = CURRENT_DATE;

  SELECT
    COALESCE(SUM(COALESCE(a.billing_amount, 0)), 0),
    COALESCE(SUM(CASE WHEN a.payment_status = 'paid'::public.appointment_payment_status THEN COALESCE(a.billing_amount, 0) ELSE 0 END), 0),
    COUNT(*)::INT,
    COUNT(*) FILTER (WHERE a.payment_status = 'paid'::public.appointment_payment_status)::INT
  INTO v_week_billed, v_week_collected, v_week_completed, v_week_paid
  FROM public.appointments a
  WHERE a.clinic_id = p_clinic_id
    AND a.status = 'completed'::public.appointment_status
    AND a.appointment_date >= (CURRENT_DATE - INTERVAL '6 days')::DATE
    AND a.appointment_date <= CURRENT_DATE;

  SELECT
    COALESCE(SUM(COALESCE(a.billing_amount, 0)), 0),
    COALESCE(SUM(CASE WHEN a.payment_status = 'paid'::public.appointment_payment_status THEN COALESCE(a.billing_amount, 0) ELSE 0 END), 0),
    COUNT(*)::INT,
    COUNT(*) FILTER (WHERE a.payment_status = 'paid'::public.appointment_payment_status)::INT
  INTO v_month_billed, v_month_collected, v_month_completed, v_month_paid
  FROM public.appointments a
  WHERE a.clinic_id = p_clinic_id
    AND a.status = 'completed'::public.appointment_status
    AND a.appointment_date >= DATE_TRUNC('month', CURRENT_DATE)::DATE
    AND a.appointment_date <= CURRENT_DATE;

  RETURN jsonb_build_object(
    'currency', COALESCE(v_currency, 'MAD'),
    'day', jsonb_build_object(
      'billed', ROUND(v_day_billed, 2),
      'collected', ROUND(v_day_collected, 2),
      'collectionRate', CASE WHEN v_day_billed > 0 THEN ROUND((v_day_collected * 100.0 / v_day_billed)::NUMERIC, 1) ELSE 0 END,
      'completedCount', v_day_completed,
      'paidCount', v_day_paid,
      'unpaidCount', GREATEST(v_day_completed - v_day_paid, 0)
    ),
    'week', jsonb_build_object(
      'billed', ROUND(v_week_billed, 2),
      'collected', ROUND(v_week_collected, 2),
      'collectionRate', CASE WHEN v_week_billed > 0 THEN ROUND((v_week_collected * 100.0 / v_week_billed)::NUMERIC, 1) ELSE 0 END,
      'completedCount', v_week_completed,
      'paidCount', v_week_paid,
      'unpaidCount', GREATEST(v_week_completed - v_week_paid, 0)
    ),
    'month', jsonb_build_object(
      'billed', ROUND(v_month_billed, 2),
      'collected', ROUND(v_month_collected, 2),
      'collectionRate', CASE WHEN v_month_billed > 0 THEN ROUND((v_month_collected * 100.0 / v_month_billed)::NUMERIC, 1) ELSE 0 END,
      'completedCount', v_month_completed,
      'paidCount', v_month_paid,
      'unpaidCount', GREATEST(v_month_completed - v_month_paid, 0)
    )
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.update_appointment_payment_status(UUID, public.appointment_payment_status, TEXT, TIMESTAMPTZ, NUMERIC, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_appointment_payment_status(UUID, public.appointment_payment_status, TEXT, TIMESTAMPTZ, NUMERIC, TEXT) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.get_clinic_revenue_kpis(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_clinic_revenue_kpis(UUID) TO authenticated;
