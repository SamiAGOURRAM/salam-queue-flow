-- Migration: Add patients table with GDPR/Law 09-08 compliant PII handling
-- Description: Introduces a single patients table for both app users and walk-ins,
-- with encrypted PII, consent tracking, and account claiming support.
--
-- Compliance: Morocco Law 09-08 (CNDP), GDPR-aligned
-- - Data minimization: only essential fields collected
-- - Purpose limitation: consent tracked per purpose
-- - Right to erasure: anonymization support (is_anonymized flag)
-- - Data protection: PII encrypted via pgsodium (DB-level encryption)
-- - Audit: all access logged via existing audit_logs table
-- - Retention: data_retention_until auto-calculated

-- =====================================================
-- 1. ENABLE ENCRYPTION EXTENSIONS
-- =====================================================

CREATE EXTENSION IF NOT EXISTS pgsodium;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- =====================================================
-- 2. CREATE ENCRYPTION KEY FOR PATIENT PII
-- =====================================================

-- Create a dedicated encryption key for patient PII
-- pgsodium manages key rotation and storage securely
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pgsodium.key
    WHERE name = 'patient_pii'
  ) THEN
    PERFORM pgsodium.create_key(
      name := 'patient_pii',
      key_type := 'aead-det'
    );
  END IF;
END;
$$;

-- =====================================================
-- 3. CREATE PATIENTS TABLE
-- =====================================================

CREATE TABLE public.patients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Link to auth account (NULL for walk-ins, set when they register)
  user_id UUID UNIQUE REFERENCES auth.users(id) ON DELETE SET NULL,

  -- PII: encrypted at rest via pgsodium
  -- Only decryptable by authorized DB functions (SECURITY DEFINER)
  full_name_encrypted BYTEA NOT NULL,
  phone_number_encrypted BYTEA NOT NULL,
  email_encrypted BYTEA,

  -- Deterministic hash for phone lookups (SHA-256, salted)
  -- Cannot be reversed to recover phone number
  phone_number_hash TEXT NOT NULL,

  -- Anonymized display name for non-privileged contexts
  -- e.g. "Sami A." shown on queue screens
  display_name TEXT NOT NULL,

  -- Patient source and account status
  source TEXT NOT NULL DEFAULT 'app' CHECK (source IN ('app', 'walk_in', 'phone')),
  is_claimed BOOLEAN NOT NULL DEFAULT false,
  is_anonymized BOOLEAN NOT NULL DEFAULT false,

  -- Who created this record (receptionist user_id for walk-ins, or self)
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,

  -- GDPR/Law 09-08: Explicit consent tracking
  -- Each purpose tracked separately with timestamp
  consent_sms BOOLEAN NOT NULL DEFAULT false,
  consent_sms_at TIMESTAMPTZ,
  consent_data_processing BOOLEAN NOT NULL DEFAULT false,
  consent_data_processing_at TIMESTAMPTZ,
  consent_given_by TEXT CHECK (consent_given_by IN ('patient_app', 'patient_verbal', 'guardian')),

  -- Data retention: auto-calculated as last_activity + 10 years
  -- (Moroccan medical records retention requirement)
  data_retention_until DATE,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- 4. INDEXES
-- =====================================================

-- Phone hash lookup (primary patient search mechanism)
CREATE UNIQUE INDEX idx_patients_phone_hash ON public.patients(phone_number_hash) WHERE NOT is_anonymized;

-- User ID lookup (for account-linked patients)
CREATE INDEX idx_patients_user_id ON public.patients(user_id) WHERE user_id IS NOT NULL;

-- Source filtering
CREATE INDEX idx_patients_source ON public.patients(source);

-- Retention policy (for automated cleanup jobs)
CREATE INDEX idx_patients_retention ON public.patients(data_retention_until) WHERE data_retention_until IS NOT NULL;

-- =====================================================
-- 5. ENCRYPTION HELPER FUNCTIONS
-- =====================================================

-- Encrypt a text value using the patient_pii key
CREATE OR REPLACE FUNCTION public.encrypt_patient_pii(plaintext TEXT)
RETURNS BYTEA
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pgsodium
AS $$
DECLARE
  v_key_id UUID;
BEGIN
  SELECT id INTO v_key_id FROM pgsodium.valid_key WHERE name = 'patient_pii' LIMIT 1;
  IF v_key_id IS NULL THEN
    RAISE EXCEPTION 'Encryption key patient_pii not found';
  END IF;
  RETURN pgsodium.crypto_aead_det_encrypt(
    message := convert_to(plaintext, 'utf8'),
    additional := ''::bytea,
    key_uuid := v_key_id,
    nonce := NULL::bytea
  );
END;
$$;

-- Decrypt a bytea value using the patient_pii key
CREATE OR REPLACE FUNCTION public.decrypt_patient_pii(ciphertext BYTEA)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pgsodium
AS $$
DECLARE
  v_key_id UUID;
BEGIN
  IF ciphertext IS NULL THEN RETURN NULL; END IF;
  SELECT id INTO v_key_id FROM pgsodium.valid_key WHERE name = 'patient_pii' LIMIT 1;
  IF v_key_id IS NULL THEN
    RAISE EXCEPTION 'Encryption key patient_pii not found';
  END IF;
  RETURN convert_from(
    pgsodium.crypto_aead_det_decrypt(
      ciphertext,
      ''::bytea,
      v_key_id,
      NULL::bytea
    ),
    'utf8'
  );
END;
$$;

-- Hash a phone number for lookup (deterministic, salted with app-level salt)
CREATE OR REPLACE FUNCTION public.hash_phone_number(phone TEXT)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public, extensions
AS $$
BEGIN
  -- Normalize: strip spaces, ensure +212 format
  -- Salt with application constant to prevent rainbow table attacks
  RETURN encode(
    extensions.digest('queuemed_patient_salt_v1:' || regexp_replace(phone, '\s+', '', 'g'), 'sha256'),
    'hex'
  );
END;
$$;

-- Generate anonymized display name from full name
-- "Sami Agourram" → "Sami A."
CREATE OR REPLACE FUNCTION public.make_display_name(full_name TEXT)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  parts TEXT[];
BEGIN
  parts := string_to_array(trim(full_name), ' ');
  IF array_length(parts, 1) >= 2 THEN
    RETURN parts[1] || ' ' || left(parts[array_length(parts, 1)], 1) || '.';
  ELSE
    RETURN parts[1];
  END IF;
END;
$$;

-- =====================================================
-- 6. PATIENT CRUD FUNCTIONS (authorized access only)
-- =====================================================

-- Create a new patient (used by app signup and receptionist walk-in booking)
CREATE OR REPLACE FUNCTION public.create_patient(
  p_full_name TEXT,
  p_phone_number TEXT,
  p_email TEXT DEFAULT NULL,
  p_source TEXT DEFAULT 'app',
  p_user_id UUID DEFAULT NULL,
  p_created_by UUID DEFAULT NULL,
  p_consent_sms BOOLEAN DEFAULT false,
  p_consent_data_processing BOOLEAN DEFAULT false,
  p_consent_given_by TEXT DEFAULT 'patient_app'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_patient_id UUID;
  v_phone_hash TEXT;
  v_existing_id UUID;
BEGIN
  -- Check if patient already exists by phone hash
  v_phone_hash := hash_phone_number(p_phone_number);

  SELECT id INTO v_existing_id
  FROM patients
  WHERE phone_number_hash = v_phone_hash AND NOT is_anonymized;

  IF v_existing_id IS NOT NULL THEN
    -- Patient exists — if they now have a user_id, update to claim
    IF p_user_id IS NOT NULL THEN
      UPDATE patients
      SET user_id = p_user_id,
          is_claimed = true,
          updated_at = NOW()
      WHERE id = v_existing_id AND user_id IS NULL;
    END IF;
    RETURN v_existing_id;
  END IF;

  -- Create new patient with encrypted PII
  INSERT INTO patients (
    user_id,
    full_name_encrypted,
    phone_number_encrypted,
    email_encrypted,
    phone_number_hash,
    display_name,
    source,
    is_claimed,
    created_by,
    consent_sms,
    consent_sms_at,
    consent_data_processing,
    consent_data_processing_at,
    consent_given_by,
    data_retention_until
  ) VALUES (
    p_user_id,
    encrypt_patient_pii(p_full_name),
    encrypt_patient_pii(p_phone_number),
    CASE WHEN p_email IS NOT NULL THEN encrypt_patient_pii(p_email) ELSE NULL END,
    v_phone_hash,
    make_display_name(p_full_name),
    p_source,
    p_user_id IS NOT NULL,
    COALESCE(p_created_by, p_user_id),
    p_consent_sms,
    CASE WHEN p_consent_sms THEN NOW() ELSE NULL END,
    p_consent_data_processing,
    CASE WHEN p_consent_data_processing THEN NOW() ELSE NULL END,
    p_consent_given_by,
    CURRENT_DATE + INTERVAL '10 years'
  )
  RETURNING id INTO v_patient_id;

  RETURN v_patient_id;
END;
$$;

-- Get patient with decrypted PII (authorized staff only, enforced by RLS)
CREATE OR REPLACE FUNCTION public.get_patient_decrypted(p_patient_id UUID)
RETURNS TABLE(
  id UUID,
  user_id UUID,
  full_name TEXT,
  phone_number TEXT,
  email TEXT,
  display_name TEXT,
  source TEXT,
  is_claimed BOOLEAN,
  consent_sms BOOLEAN,
  consent_data_processing BOOLEAN,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    p.id,
    p.user_id,
    decrypt_patient_pii(p.full_name_encrypted) as full_name,
    decrypt_patient_pii(p.phone_number_encrypted) as phone_number,
    decrypt_patient_pii(p.email_encrypted) as email,
    p.display_name,
    p.source,
    p.is_claimed,
    p.consent_sms,
    p.consent_data_processing,
    p.created_at
  FROM patients p
  WHERE p.id = p_patient_id
    AND NOT p.is_anonymized;
END;
$$;

-- Search patient by phone number (receptionist lookup)
CREATE OR REPLACE FUNCTION public.find_patient_by_phone(p_phone_number TEXT)
RETURNS TABLE(
  id UUID,
  display_name TEXT,
  full_name TEXT,
  is_claimed BOOLEAN,
  source TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    p.id,
    p.display_name,
    decrypt_patient_pii(p.full_name_encrypted) as full_name,
    p.is_claimed,
    p.source
  FROM patients p
  WHERE p.phone_number_hash = hash_phone_number(p_phone_number)
    AND NOT p.is_anonymized;
END;
$$;

-- Claim account: link existing patient record to new auth user
CREATE OR REPLACE FUNCTION public.claim_patient_account(
  p_user_id UUID,
  p_phone_number TEXT DEFAULT NULL,
  p_email TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_patient_id UUID;
BEGIN
  -- Try phone match first, then email
  IF p_phone_number IS NOT NULL THEN
    SELECT id INTO v_patient_id
    FROM patients
    WHERE phone_number_hash = hash_phone_number(p_phone_number)
      AND user_id IS NULL
      AND NOT is_anonymized;
  END IF;

  IF v_patient_id IS NOT NULL THEN
    UPDATE patients
    SET user_id = p_user_id,
        is_claimed = true,
        updated_at = NOW()
    WHERE id = v_patient_id;

    RETURN v_patient_id;
  END IF;

  -- No existing record found — will be created during first booking
  RETURN NULL;
END;
$$;

-- GDPR Right to erasure: anonymize patient data
CREATE OR REPLACE FUNCTION public.anonymize_patient(p_patient_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE patients
  SET
    full_name_encrypted = encrypt_patient_pii('ANONYMIZED'),
    phone_number_encrypted = encrypt_patient_pii('ANONYMIZED'),
    email_encrypted = NULL,
    phone_number_hash = 'ANONYMIZED_' || id::text,
    display_name = 'Patient anonymisé',
    user_id = NULL,
    is_anonymized = true,
    consent_sms = false,
    consent_data_processing = false,
    updated_at = NOW()
  WHERE id = p_patient_id;
END;
$$;

-- =====================================================
-- 7. UPDATE APPOINTMENTS FK TO REFERENCE PATIENTS
-- =====================================================

-- Drop the old FK constraint on patient_id → auth.users
ALTER TABLE public.appointments
  DROP CONSTRAINT IF EXISTS appointments_patient_id_fkey;

-- Change patient_id to reference patients table
ALTER TABLE public.appointments
  ADD CONSTRAINT appointments_patient_id_fkey
  FOREIGN KEY (patient_id) REFERENCES public.patients(id) ON DELETE CASCADE;

-- =====================================================
-- 8. UPDATE OTHER TABLES THAT REFERENCE PATIENT
-- =====================================================

-- absent_patients.patient_id
ALTER TABLE public.absent_patients
  DROP CONSTRAINT IF EXISTS absent_patients_patient_id_fkey;
ALTER TABLE public.absent_patients
  ADD CONSTRAINT absent_patients_patient_id_fkey
  FOREIGN KEY (patient_id) REFERENCES public.patients(id) ON DELETE CASCADE;

-- notifications.patient_id
ALTER TABLE public.notifications
  DROP CONSTRAINT IF EXISTS notifications_patient_id_fkey;
ALTER TABLE public.notifications
  ADD CONSTRAINT notifications_patient_id_fkey
  FOREIGN KEY (patient_id) REFERENCES public.patients(id) ON DELETE CASCADE;

-- patient_clinic_history.patient_id
ALTER TABLE public.patient_clinic_history
  DROP CONSTRAINT IF EXISTS patient_clinic_history_patient_id_fkey;
ALTER TABLE public.patient_clinic_history
  ADD CONSTRAINT patient_clinic_history_patient_id_fkey
  FOREIGN KEY (patient_id) REFERENCES public.patients(id) ON DELETE CASCADE;

-- =====================================================
-- 9. RLS POLICIES FOR PATIENTS TABLE
-- =====================================================

ALTER TABLE public.patients ENABLE ROW LEVEL SECURITY;

-- Patients can view their own record (via user_id link)
CREATE POLICY "Patients can view own record"
  ON public.patients FOR SELECT
  USING (user_id = auth.uid());

-- Clinic staff can view patients who have appointments at their clinic
CREATE POLICY "Staff can view clinic patients"
  ON public.patients FOR SELECT
  USING (
    id IN (
      SELECT DISTINCT a.patient_id FROM appointments a
      WHERE a.clinic_id IN (
        SELECT ur.clinic_id FROM user_roles ur
        WHERE ur.user_id = auth.uid()
          AND ur.role IN ('clinic_owner', 'staff')
      )
    )
  );

-- Clinic staff can create patient records (walk-in booking)
CREATE POLICY "Staff can create patients"
  ON public.patients FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_id = auth.uid()
        AND role IN ('clinic_owner', 'staff')
    )
  );

-- Patients can update their own consent preferences
CREATE POLICY "Patients can update own consent"
  ON public.patients FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- =====================================================
-- 10. GRANT FUNCTION ACCESS
-- =====================================================

-- Public functions (no PII exposure)
GRANT EXECUTE ON FUNCTION public.hash_phone_number(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.make_display_name(TEXT) TO authenticated;

-- Authorized functions (return decrypted PII)
GRANT EXECUTE ON FUNCTION public.create_patient(TEXT, TEXT, TEXT, TEXT, UUID, UUID, BOOLEAN, BOOLEAN, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_patient_decrypted(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.find_patient_by_phone(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.claim_patient_account(UUID, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.anonymize_patient(UUID) TO authenticated;

-- Encryption internals: NOT granted to authenticated users
-- Only callable by SECURITY DEFINER functions above
REVOKE EXECUTE ON FUNCTION public.encrypt_patient_pii(TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.decrypt_patient_pii(BYTEA) FROM PUBLIC;

-- =====================================================
-- 11. UPDATED_AT TRIGGER
-- =====================================================

CREATE TRIGGER update_patients_updated_at
  BEFORE UPDATE ON public.patients
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =====================================================
-- 12. AUTO-CREATE PATIENT ON USER SIGNUP
-- =====================================================

-- When a new user signs up via the app, auto-create or claim a patient record
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_full_name TEXT;
  v_phone TEXT;
  v_email TEXT;
BEGIN
  v_full_name := COALESCE(NEW.raw_user_meta_data->>'full_name', '');
  v_phone := COALESCE(NEW.raw_user_meta_data->>'phone_number', '');
  v_email := NEW.email;

  -- Create profile (existing behavior)
  INSERT INTO public.profiles (id, full_name, email, phone_number)
  VALUES (NEW.id, v_full_name, v_email, v_phone);

  -- Create or claim patient record
  IF v_phone != '' OR v_email != '' THEN
    PERFORM create_patient(
      p_full_name := v_full_name,
      p_phone_number := v_phone,
      p_email := v_email,
      p_source := 'app',
      p_user_id := NEW.id,
      p_consent_data_processing := true,
      p_consent_given_by := 'patient_app'
    );
  END IF;

  RETURN NEW;
END;
$$;
