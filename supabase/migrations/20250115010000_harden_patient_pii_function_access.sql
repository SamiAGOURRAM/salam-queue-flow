-- Migration: Harden access checks for decrypted patient PII functions
-- Purpose: Ensure only authorized users can read decrypted patient data

-- Restrict get_patient_decrypted to:
-- 1) super admins
-- 2) the patient themselves
-- 3) clinic staff/owners for clinics where the patient has appointments
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
  IF NOT (
    EXISTS (
      SELECT 1
      FROM user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role = 'super_admin'
    )
    OR EXISTS (
      SELECT 1
      FROM patients p_self
      WHERE p_self.id = p_patient_id
        AND p_self.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1
      FROM appointments a
      JOIN user_roles ur ON ur.clinic_id = a.clinic_id
      WHERE a.patient_id = p_patient_id
        AND ur.user_id = auth.uid()
        AND ur.role IN ('clinic_owner', 'staff')
    )
  ) THEN
    RAISE EXCEPTION 'Not authorized to access decrypted patient data';
  END IF;

  RETURN QUERY
  SELECT
    p.id,
    p.user_id,
    decrypt_patient_pii(p.full_name_encrypted) AS full_name,
    decrypt_patient_pii(p.phone_number_encrypted) AS phone_number,
    decrypt_patient_pii(p.email_encrypted) AS email,
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

-- Restrict phone lookup with decrypted name to staff/admin roles only
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
  IF NOT EXISTS (
    SELECT 1
    FROM user_roles ur
    WHERE ur.user_id = auth.uid()
      AND ur.role IN ('super_admin', 'clinic_owner', 'staff')
  ) THEN
    RAISE EXCEPTION 'Not authorized to lookup patients by phone';
  END IF;

  RETURN QUERY
  SELECT
    p.id,
    p.display_name,
    decrypt_patient_pii(p.full_name_encrypted) AS full_name,
    p.is_claimed,
    p.source
  FROM patients p
  WHERE p.phone_number_hash = hash_phone_number(p_phone_number)
    AND NOT p.is_anonymized;
END;
$$;
