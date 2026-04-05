-- P3 medical sharing foundation tables, indexes, triggers, and RLS scaffolding.
-- This migration is intentionally schema-focused; access is mediated via SECURITY DEFINER RPCs.

CREATE TABLE IF NOT EXISTS public.medical_record_access_grants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE RESTRICT,
  grantee_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,

  clinic_id UUID NOT NULL REFERENCES public.clinics(id) ON DELETE RESTRICT,
  appointment_id UUID NOT NULL REFERENCES public.appointments(id) ON DELETE RESTRICT,
  owner_override_reason TEXT,

  requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  granted_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  duration_seconds INT,

  scope JSONB NOT NULL DEFAULT '{"type":"full_history"}'::jsonb,

  status TEXT NOT NULL DEFAULT 'pending_otp'
    CHECK (status IN ('pending_otp', 'active', 'revoked', 'expired')),

  revoked_at TIMESTAMPTZ,
  revoked_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  revocation_reason TEXT,

  consent_method TEXT
    CHECK (consent_method IN ('otp_sms', 'otp_email', 'in_app_confirm', 'otp_verbal')),
  consent_recorded_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT grants_active_fields_chk CHECK (
    status <> 'active'
    OR (granted_at IS NOT NULL AND expires_at IS NOT NULL AND duration_seconds IS NOT NULL AND revoked_at IS NULL)
  ),
  CONSTRAINT grants_pending_fields_chk CHECK (
    status <> 'pending_otp'
    OR (granted_at IS NULL AND expires_at IS NULL)
  ),
  CONSTRAINT grants_revoked_fields_chk CHECK (
    status <> 'revoked'
    OR revoked_at IS NOT NULL
  )
);

CREATE INDEX IF NOT EXISTS idx_med_grants_grantee_active
  ON public.medical_record_access_grants(grantee_user_id, status)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_med_grants_patient_status
  ON public.medical_record_access_grants(patient_id, status);

CREATE INDEX IF NOT EXISTS idx_med_grants_expires_at
  ON public.medical_record_access_grants(expires_at)
  WHERE status = 'active';

CREATE UNIQUE INDEX IF NOT EXISTS idx_med_grants_unique_active_pair
  ON public.medical_record_access_grants(patient_id, grantee_user_id)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_med_grants_pending_pair_created
  ON public.medical_record_access_grants(patient_id, grantee_user_id, created_at DESC)
  WHERE status = 'pending_otp';

DROP TRIGGER IF EXISTS set_updated_at_medical_record_access_grants ON public.medical_record_access_grants;
CREATE TRIGGER set_updated_at_medical_record_access_grants
  BEFORE UPDATE ON public.medical_record_access_grants
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


CREATE TABLE IF NOT EXISTS public.medical_record_otp_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  grant_id UUID NOT NULL REFERENCES public.medical_record_access_grants(id) ON DELETE CASCADE,

  code_hmac TEXT NOT NULL,
  code_salt BYTEA NOT NULL,
  code_key_version TEXT NOT NULL DEFAULT 'v1',

  delivery_channel TEXT NOT NULL CHECK (delivery_channel IN ('sms', 'email')),
  delivered_to_encrypted BYTEA,
  delivery_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (delivery_status IN ('pending', 'sending', 'sent', 'delivered', 'failed')),
  delivery_attempt_count INT NOT NULL DEFAULT 0,
  last_delivery_attempt_at TIMESTAMPTZ,
  delivery_error TEXT,

  expires_at TIMESTAMPTZ NOT NULL,
  validated_at TIMESTAMPTZ,
  is_used BOOLEAN NOT NULL DEFAULT false,

  attempt_count INT NOT NULL DEFAULT 0,
  max_attempts INT NOT NULL DEFAULT 5,
  locked_until TIMESTAMPTZ,

  requesting_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE RESTRICT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_med_otp_grant_active
  ON public.medical_record_otp_codes(grant_id)
  WHERE NOT is_used;

CREATE INDEX IF NOT EXISTS idx_med_otp_delivery_pending
  ON public.medical_record_otp_codes(grant_id, created_at DESC)
  WHERE delivery_status IN ('pending', 'sending');

CREATE INDEX IF NOT EXISTS idx_med_otp_rate_limit
  ON public.medical_record_otp_codes(requesting_user_id, patient_id, created_at DESC);


CREATE TABLE IF NOT EXISTS public.medical_record_access_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  grant_id UUID REFERENCES public.medical_record_access_grants(id) ON DELETE SET NULL,
  accessed_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,

  patient_id UUID REFERENCES public.patients(id) ON DELETE SET NULL,
  patient_pseudonym TEXT NOT NULL,
  clinic_id UUID NOT NULL REFERENCES public.clinics(id) ON DELETE RESTRICT,

  record_type TEXT NOT NULL
    CHECK (record_type IN ('appointment_history', 'appointment_detail', 'doctor_notes', 'lab_results', 'prescription', 'diagnosis')),
  record_id UUID,

  action TEXT NOT NULL CHECK (action IN ('view', 'list', 'export', 'print')),

  ip_address INET,
  user_agent TEXT,

  accessed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_med_access_log_patient
  ON public.medical_record_access_log(patient_id, accessed_at DESC);

CREATE INDEX IF NOT EXISTS idx_med_access_log_grant
  ON public.medical_record_access_log(grant_id, accessed_at DESC);

CREATE INDEX IF NOT EXISTS idx_med_access_log_clinic
  ON public.medical_record_access_log(clinic_id, accessed_at DESC);


CREATE TABLE IF NOT EXISTS public.medical_record_diagnoses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  appointment_id UUID NOT NULL REFERENCES public.appointments(id) ON DELETE CASCADE,
  patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE RESTRICT,
  clinic_id UUID NOT NULL REFERENCES public.clinics(id) ON DELETE RESTRICT,
  diagnosed_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  diagnosis_code TEXT,
  diagnosis_label TEXT NOT NULL,
  diagnosis_notes TEXT,
  is_patient_visible BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_med_diagnoses_patient_created
  ON public.medical_record_diagnoses(patient_id, created_at DESC);

DROP TRIGGER IF EXISTS set_updated_at_medical_record_diagnoses ON public.medical_record_diagnoses;
CREATE TRIGGER set_updated_at_medical_record_diagnoses
  BEFORE UPDATE ON public.medical_record_diagnoses
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


CREATE TABLE IF NOT EXISTS public.medical_record_prescriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  appointment_id UUID NOT NULL REFERENCES public.appointments(id) ON DELETE CASCADE,
  patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE RESTRICT,
  clinic_id UUID NOT NULL REFERENCES public.clinics(id) ON DELETE RESTRICT,
  prescribed_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  medication_name TEXT NOT NULL,
  dosage TEXT,
  route TEXT,
  frequency TEXT,
  duration_days INT,
  instructions TEXT,
  is_patient_visible BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_med_prescriptions_patient_created
  ON public.medical_record_prescriptions(patient_id, created_at DESC);

DROP TRIGGER IF EXISTS set_updated_at_medical_record_prescriptions ON public.medical_record_prescriptions;
CREATE TRIGGER set_updated_at_medical_record_prescriptions
  BEFORE UPDATE ON public.medical_record_prescriptions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


CREATE TABLE IF NOT EXISTS public.medical_record_lab_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  appointment_id UUID NOT NULL REFERENCES public.appointments(id) ON DELETE CASCADE,
  patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE RESTRICT,
  clinic_id UUID NOT NULL REFERENCES public.clinics(id) ON DELETE RESTRICT,
  recorded_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  test_name TEXT NOT NULL,
  result_value TEXT,
  unit TEXT,
  reference_range TEXT,
  interpretation TEXT,
  is_patient_visible BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_med_lab_results_patient_created
  ON public.medical_record_lab_results(patient_id, created_at DESC);

DROP TRIGGER IF EXISTS set_updated_at_medical_record_lab_results ON public.medical_record_lab_results;
CREATE TRIGGER set_updated_at_medical_record_lab_results
  BEFORE UPDATE ON public.medical_record_lab_results
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


ALTER TABLE public.medical_record_access_grants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.medical_record_otp_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.medical_record_access_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.medical_record_diagnoses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.medical_record_prescriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.medical_record_lab_results ENABLE ROW LEVEL SECURITY;

-- Grants: patient can view own grants.
DROP POLICY IF EXISTS patients_view_own_grants ON public.medical_record_access_grants;
CREATE POLICY patients_view_own_grants
  ON public.medical_record_access_grants FOR SELECT
  USING (
    patient_id IN (
      SELECT p.id
      FROM public.patients p
      WHERE p.user_id = auth.uid()
        AND NOT p.is_anonymized
    )
  );

-- Grants: doctor/staff sees grants where they are grantee.
DROP POLICY IF EXISTS doctors_view_received_grants ON public.medical_record_access_grants;
CREATE POLICY doctors_view_received_grants
  ON public.medical_record_access_grants FOR SELECT
  USING (grantee_user_id = auth.uid());

-- OTP records: only requesting doctor may read own OTP status.
DROP POLICY IF EXISTS requesting_doctor_views_otp ON public.medical_record_otp_codes;
CREATE POLICY requesting_doctor_views_otp
  ON public.medical_record_otp_codes FOR SELECT
  USING (requesting_user_id = auth.uid());

-- Access log: patient can read own access log entries.
DROP POLICY IF EXISTS patients_view_own_access_logs ON public.medical_record_access_log;
CREATE POLICY patients_view_own_access_logs
  ON public.medical_record_access_log FOR SELECT
  USING (
    patient_id IN (
      SELECT p.id
      FROM public.patients p
      WHERE p.user_id = auth.uid()
        AND NOT p.is_anonymized
    )
  );

-- Access log: clinic owners can read clinic-level logs.
DROP POLICY IF EXISTS clinic_owners_view_clinic_logs ON public.medical_record_access_log;
CREATE POLICY clinic_owners_view_clinic_logs
  ON public.medical_record_access_log FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.clinic_id = medical_record_access_log.clinic_id
        AND ur.role = 'clinic_owner'
    )
  );

-- Access log: accessor can read own log entries.
DROP POLICY IF EXISTS doctors_view_own_access_logs ON public.medical_record_access_log;
CREATE POLICY doctors_view_own_access_logs
  ON public.medical_record_access_log FOR SELECT
  USING (accessed_by = auth.uid());
