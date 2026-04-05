-- P3 medical sharing RPCs.
-- SECURITY DEFINER is used for strict server-side checks + minimized outputs.

-- =====================================================================================
-- Internal helpers
-- =====================================================================================

CREATE OR REPLACE FUNCTION public._medical_assert_authenticated()
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;
  RETURN v_user_id;
END;
$$;

CREATE OR REPLACE FUNCTION public._medical_assert_service_role()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role TEXT;
BEGIN
  v_role := current_setting('request.jwt.claim.role', true);
  IF COALESCE(v_role, '') <> 'service_role' THEN
    RAISE EXCEPTION 'Service role required' USING ERRCODE = '42501';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public._medical_is_clinic_owner(
  p_user_id UUID,
  p_clinic_id UUID
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    WHERE ur.user_id = p_user_id
      AND ur.clinic_id = p_clinic_id
      AND ur.role = 'clinic_owner'
  );
$$;

CREATE OR REPLACE FUNCTION public._medical_scope_allows_appointment(
  p_scope JSONB,
  p_appointment_id UUID,
  p_appointment_date DATE
)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_type TEXT;
  v_from DATE;
  v_to DATE;
BEGIN
  v_type := COALESCE(p_scope->>'type', 'full_history');

  IF v_type = 'full_history' THEN
    RETURN true;
  ELSIF v_type = 'date_range' THEN
    v_from := NULLIF(p_scope->>'from', '')::date;
    v_to := NULLIF(p_scope->>'to', '')::date;
    IF v_from IS NULL OR v_to IS NULL THEN
      RETURN false;
    END IF;
    RETURN p_appointment_date BETWEEN v_from AND v_to;
  ELSIF v_type = 'specific_appointments' THEN
    RETURN EXISTS (
      SELECT 1
      FROM jsonb_array_elements_text(COALESCE(p_scope->'appointment_ids', '[]'::jsonb)) elem
      WHERE elem::uuid = p_appointment_id
    );
  END IF;

  RETURN false;
END;
$$;

CREATE OR REPLACE FUNCTION public._medical_insert_audit_log(
  p_user_id UUID,
  p_clinic_id UUID,
  p_entity_type TEXT,
  p_entity_id UUID,
  p_action TEXT,
  p_changes JSONB DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.audit_logs (user_id, clinic_id, entity_type, entity_id, action, changes)
  VALUES (p_user_id, p_clinic_id, p_entity_type, p_entity_id, p_action, p_changes);
END;
$$;

CREATE OR REPLACE FUNCTION public._medical_resolve_delivery_channel(
  p_patient_id UUID
)
RETURNS TABLE (
  patient_has_app BOOLEAN,
  delivery_channel TEXT,
  recipient_contact TEXT,
  consent_sms BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_patient public.patients%ROWTYPE;
  v_profile public.profiles%ROWTYPE;
  v_pref TEXT;
  v_phone TEXT;
  v_email TEXT;
BEGIN
  SELECT * INTO v_patient
  FROM public.patients p
  WHERE p.id = p_patient_id
    AND NOT p.is_anonymized;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Patient not found or anonymized';
  END IF;

  patient_has_app := v_patient.user_id IS NOT NULL;
  consent_sms := COALESCE(v_patient.consent_sms, false);

  v_phone := public.decrypt_patient_pii(v_patient.phone_number_encrypted);
  v_email := public.decrypt_patient_pii(v_patient.email_encrypted);

  IF v_patient.user_id IS NOT NULL THEN
    SELECT * INTO v_profile
    FROM public.profiles pr
    WHERE pr.id = v_patient.user_id;

    v_pref := COALESCE(
      v_profile.notification_preferences->>'medical_record_channel',
      v_profile.notification_preferences->>'preferred_channel',
      ''
    );
  ELSE
    v_pref := '';
  END IF;

  IF v_pref = 'email' AND v_email IS NOT NULL AND btrim(v_email) <> '' THEN
    delivery_channel := 'email';
    recipient_contact := v_email;
    RETURN NEXT;
    RETURN;
  END IF;

  IF v_pref = 'sms' AND consent_sms AND v_phone IS NOT NULL AND btrim(v_phone) <> '' THEN
    delivery_channel := 'sms';
    recipient_contact := v_phone;
    RETURN NEXT;
    RETURN;
  END IF;

  IF consent_sms AND v_phone IS NOT NULL AND btrim(v_phone) <> '' THEN
    delivery_channel := 'sms';
    recipient_contact := v_phone;
    RETURN NEXT;
    RETURN;
  END IF;

  IF v_email IS NOT NULL AND btrim(v_email) <> '' THEN
    delivery_channel := 'email';
    recipient_contact := v_email;
    RETURN NEXT;
    RETURN;
  END IF;

  IF v_phone IS NOT NULL AND btrim(v_phone) <> '' THEN
    -- Last-resort fallback for legacy data where consent was not recorded.
    delivery_channel := 'sms';
    recipient_contact := v_phone;
    RETURN NEXT;
    RETURN;
  END IF;
END;
$$;


-- =====================================================================================
-- Service-role helper RPCs
-- =====================================================================================

CREATE OR REPLACE FUNCTION public.get_medical_record_delivery_contact_for_service(
  p_patient_id UUID
)
RETURNS TABLE (
  phone_number TEXT,
  email TEXT,
  consent_sms BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_patient public.patients%ROWTYPE;
BEGIN
  PERFORM public._medical_assert_service_role();

  SELECT * INTO v_patient
  FROM public.patients p
  WHERE p.id = p_patient_id
    AND NOT p.is_anonymized;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Patient not found or anonymized';
  END IF;

  RETURN QUERY
  SELECT
    public.decrypt_patient_pii(v_patient.phone_number_encrypted),
    public.decrypt_patient_pii(v_patient.email_encrypted),
    COALESCE(v_patient.consent_sms, false);
END;
$$;

CREATE OR REPLACE FUNCTION public.claim_medical_record_otp_for_delivery(
  p_grant_id UUID,
  p_requester_user_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_grant public.medical_record_access_grants%ROWTYPE;
  v_appointment public.appointments%ROWTYPE;
  v_resolved RECORD;
  v_recent_count INTEGER;
  v_recent_otp public.medical_record_otp_codes%ROWTYPE;
  v_otp_id UUID;
  v_otp_plaintext TEXT;
  v_code_salt BYTEA;
  v_code_key_version TEXT := 'v1';
  v_hmac_secret TEXT;
  v_code_hmac TEXT;
BEGIN
  PERFORM public._medical_assert_service_role();

  IF p_grant_id IS NULL OR p_requester_user_id IS NULL THEN
    RAISE EXCEPTION 'grant_id and requester_user_id are required';
  END IF;

  SELECT * INTO v_grant
  FROM public.medical_record_access_grants g
  WHERE g.id = p_grant_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Grant not found';
  END IF;

  IF v_grant.status <> 'pending_otp' THEN
    RAISE EXCEPTION 'Grant is not pending OTP';
  END IF;

  IF v_grant.grantee_user_id <> p_requester_user_id THEN
    RAISE EXCEPTION 'Requester is not the grant grantee' USING ERRCODE = '42501';
  END IF;

  IF NOT public._user_can_manage_clinic(v_grant.clinic_id, p_requester_user_id) THEN
    RAISE EXCEPTION 'Requester cannot manage clinic' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_appointment
  FROM public.appointments a
  WHERE a.id = v_grant.appointment_id;

  IF NOT FOUND OR v_appointment.status <> 'in_progress' THEN
    RAISE EXCEPTION 'Appointment context is not in progress';
  END IF;

  SELECT * INTO v_resolved
  FROM public._medical_resolve_delivery_channel(v_grant.patient_id)
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No contact channel available';
  END IF;

  SELECT * INTO v_recent_otp
  FROM public.medical_record_otp_codes o
  WHERE o.grant_id = v_grant.id
    AND NOT o.is_used
    AND o.expires_at > NOW()
  ORDER BY o.created_at DESC
  LIMIT 1
  FOR UPDATE;

  IF FOUND THEN
    IF v_recent_otp.delivery_status = 'sending' AND v_recent_otp.created_at > NOW() - INTERVAL '20 seconds' THEN
      RAISE EXCEPTION 'Delivery already in progress';
    END IF;

    IF v_recent_otp.delivery_status IN ('sent', 'delivered') AND v_recent_otp.created_at > NOW() - INTERVAL '30 seconds' THEN
      RAISE EXCEPTION 'OTP resend cooldown active';
    END IF;
  END IF;

  SELECT COUNT(*) INTO v_recent_count
  FROM public.medical_record_otp_codes o
  WHERE o.requesting_user_id = p_requester_user_id
    AND o.patient_id = v_grant.patient_id
    AND o.created_at > NOW() - INTERVAL '15 minutes';

  IF v_recent_count >= 3 THEN
    RAISE EXCEPTION 'Rate limit exceeded. Maximum 3 requests per 15 minutes for this patient.'
      USING ERRCODE = 'P0429';
  END IF;

  v_hmac_secret := current_setting('app.settings.medical_otp_hmac_key_v1', true);
  IF v_hmac_secret IS NULL OR v_hmac_secret = '' THEN
    RAISE EXCEPTION 'Medical OTP HMAC secret is not configured';
  END IF;

  v_otp_plaintext := lpad((floor(random() * 900000) + 100000)::int::text, 6, '0');
  v_code_salt := gen_random_bytes(16);
  v_code_hmac := encode(
    hmac(v_otp_plaintext || ':' || encode(v_code_salt, 'hex'), v_hmac_secret, 'sha256'),
    'hex'
  );

  INSERT INTO public.medical_record_otp_codes (
    grant_id,
    code_hmac,
    code_salt,
    code_key_version,
    delivery_channel,
    delivered_to_encrypted,
    delivery_status,
    delivery_attempt_count,
    last_delivery_attempt_at,
    expires_at,
    requesting_user_id,
    patient_id
  ) VALUES (
    v_grant.id,
    v_code_hmac,
    v_code_salt,
    v_code_key_version,
    v_resolved.delivery_channel,
    public.encrypt_patient_pii(v_resolved.recipient_contact),
    'sending',
    1,
    NOW(),
    NOW() + INTERVAL '5 minutes',
    p_requester_user_id,
    v_grant.patient_id
  )
  RETURNING id INTO v_otp_id;

  RETURN jsonb_build_object(
    'otp_id', v_otp_id,
    'otp_plaintext', v_otp_plaintext,
    'delivery_channel', v_resolved.delivery_channel,
    'recipient_contact', v_resolved.recipient_contact
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.finalize_medical_record_otp_delivery(
  p_otp_id UUID,
  p_success BOOLEAN,
  p_error TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_otp public.medical_record_otp_codes%ROWTYPE;
  v_status TEXT;
BEGIN
  PERFORM public._medical_assert_service_role();

  IF p_otp_id IS NULL THEN
    RAISE EXCEPTION 'otp_id is required';
  END IF;

  SELECT * INTO v_otp
  FROM public.medical_record_otp_codes o
  WHERE o.id = p_otp_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'OTP row not found';
  END IF;

  IF v_otp.delivery_status NOT IN ('sending', 'sent', 'failed', 'delivered') THEN
    RAISE EXCEPTION 'OTP row not claimable from status %', v_otp.delivery_status;
  END IF;

  IF p_success THEN
    v_status := 'sent';
    UPDATE public.medical_record_otp_codes
    SET delivery_status = v_status,
        delivery_error = NULL
    WHERE id = p_otp_id;
  ELSE
    v_status := 'failed';
    UPDATE public.medical_record_otp_codes
    SET delivery_status = v_status,
        delivery_error = COALESCE(p_error, 'Delivery failed')
    WHERE id = p_otp_id;
  END IF;

  RETURN jsonb_build_object('success', p_success, 'status', v_status, 'otp_id', p_otp_id);
END;
$$;


-- =====================================================================================
-- Main feature RPCs (authenticated)
-- =====================================================================================

CREATE OR REPLACE FUNCTION public.request_medical_record_access(
  p_patient_id UUID,
  p_appointment_id UUID,
  p_clinic_id UUID,
  p_owner_override_reason TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_patient public.patients%ROWTYPE;
  v_appointment public.appointments%ROWTYPE;
  v_staff_user_id UUID;
  v_is_assigned_doctor BOOLEAN;
  v_is_owner BOOLEAN;
  v_active_grant public.medical_record_access_grants%ROWTYPE;
  v_pending_grant public.medical_record_access_grants%ROWTYPE;
  v_grant public.medical_record_access_grants%ROWTYPE;
  v_resolved RECORD;
BEGIN
  v_user_id := public._medical_assert_authenticated();

  IF p_patient_id IS NULL OR p_appointment_id IS NULL OR p_clinic_id IS NULL THEN
    RAISE EXCEPTION 'patient_id, appointment_id, and clinic_id are required';
  END IF;

  IF NOT public._user_can_manage_clinic(p_clinic_id, v_user_id) THEN
    RAISE EXCEPTION 'You are not allowed to request access for this clinic' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_appointment
  FROM public.appointments a
  WHERE a.id = p_appointment_id
    AND a.patient_id = p_patient_id
    AND a.clinic_id = p_clinic_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Appointment context mismatch';
  END IF;

  IF v_appointment.status <> 'in_progress' THEN
    RAISE EXCEPTION 'Medical record access can only be requested during in-progress appointments';
  END IF;

  SELECT cs.user_id INTO v_staff_user_id
  FROM public.clinic_staff cs
  WHERE cs.id = v_appointment.staff_id;

  v_is_assigned_doctor := (v_staff_user_id = v_user_id);
  v_is_owner := public._medical_is_clinic_owner(v_user_id, p_clinic_id);

  IF NOT v_is_assigned_doctor THEN
    IF NOT v_is_owner OR COALESCE(btrim(p_owner_override_reason), '') = '' THEN
      RAISE EXCEPTION 'Only assigned doctor may request access unless clinic owner override reason is provided' USING ERRCODE = '42501';
    END IF;
  END IF;

  SELECT * INTO v_patient
  FROM public.patients p
  WHERE p.id = p_patient_id
    AND NOT p.is_anonymized;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Patient not found or anonymized';
  END IF;

  SELECT * INTO v_active_grant
  FROM public.medical_record_access_grants g
  WHERE g.patient_id = p_patient_id
    AND g.grantee_user_id = v_user_id
    AND g.status = 'active'
    AND g.expires_at > NOW()
    AND g.revoked_at IS NULL
  ORDER BY g.created_at DESC
  LIMIT 1;

  IF FOUND THEN
    SELECT * INTO v_resolved
    FROM public._medical_resolve_delivery_channel(p_patient_id)
    LIMIT 1;

    RETURN jsonb_build_object(
      'grant_id', v_active_grant.id,
      'delivery_channel', COALESCE(v_resolved.delivery_channel, 'sms'),
      'patient_has_app', COALESCE(v_resolved.patient_has_app, false),
      'delivery_status', 'sent',
      'otp_ttl_seconds', 300,
      'has_access', true,
      'expires_at', v_active_grant.expires_at
    );
  END IF;

  SELECT * INTO v_pending_grant
  FROM public.medical_record_access_grants g
  WHERE g.patient_id = p_patient_id
    AND g.grantee_user_id = v_user_id
    AND g.status = 'pending_otp'
  ORDER BY g.created_at DESC
  LIMIT 1;

  IF FOUND THEN
    IF v_pending_grant.created_at < NOW() - INTERVAL '30 minutes' THEN
      UPDATE public.medical_record_access_grants
      SET status = 'expired',
          updated_at = NOW()
      WHERE id = v_pending_grant.id;
      v_pending_grant := NULL;
    END IF;
  END IF;

  IF v_pending_grant.id IS NULL THEN
    INSERT INTO public.medical_record_access_grants (
      patient_id,
      grantee_user_id,
      clinic_id,
      appointment_id,
      owner_override_reason,
      status,
      scope
    ) VALUES (
      p_patient_id,
      v_user_id,
      p_clinic_id,
      p_appointment_id,
      NULLIF(btrim(p_owner_override_reason), ''),
      'pending_otp',
      '{"type":"full_history"}'::jsonb
    )
    RETURNING * INTO v_grant;
  ELSE
    v_grant := v_pending_grant;
  END IF;

  SELECT * INTO v_resolved
  FROM public._medical_resolve_delivery_channel(p_patient_id)
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'error', 'no_contact_channel',
      'message', 'Patient has no phone or email on file',
      'grant_id', v_grant.id
    );
  END IF;

  PERFORM public._medical_insert_audit_log(
    v_user_id,
    p_clinic_id,
    'medical_record_grant',
    v_grant.id,
    'request',
    jsonb_build_object(
      'appointment_id', p_appointment_id,
      'patient_id', p_patient_id,
      'delivery_channel', v_resolved.delivery_channel,
      'owner_override_reason', NULLIF(btrim(p_owner_override_reason), '')
    )
  );

  RETURN jsonb_build_object(
    'grant_id', v_grant.id,
    'delivery_channel', v_resolved.delivery_channel,
    'patient_has_app', v_resolved.patient_has_app,
    'delivery_status', 'pending',
    'otp_ttl_seconds', 300
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.validate_medical_record_otp(
  p_grant_id UUID,
  p_code TEXT,
  p_duration_seconds INT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_grant public.medical_record_access_grants%ROWTYPE;
  v_otp public.medical_record_otp_codes%ROWTYPE;
  v_hmac_secret TEXT;
  v_input_hmac TEXT;
  v_new_attempt_count INT;
BEGIN
  v_user_id := public._medical_assert_authenticated();

  IF p_grant_id IS NULL OR p_code IS NULL OR btrim(p_code) = '' THEN
    RAISE EXCEPTION 'grant_id and code are required';
  END IF;

  IF p_duration_seconds IS NULL OR p_duration_seconds < 300 OR p_duration_seconds > 2592000 THEN
    RAISE EXCEPTION 'duration_seconds must be between 300 and 2592000';
  END IF;

  SELECT * INTO v_grant
  FROM public.medical_record_access_grants g
  WHERE g.id = p_grant_id
    AND g.grantee_user_id = v_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'not_authorized');
  END IF;

  IF v_grant.status <> 'pending_otp' THEN
    IF v_grant.status = 'active' AND v_grant.expires_at > NOW() AND v_grant.revoked_at IS NULL THEN
      RETURN jsonb_build_object('error', 'already_active', 'expires_at', v_grant.expires_at);
    END IF;
    RETURN jsonb_build_object('error', 'invalid_grant_status', 'status', v_grant.status);
  END IF;

  SELECT * INTO v_otp
  FROM public.medical_record_otp_codes o
  WHERE o.grant_id = p_grant_id
    AND NOT o.is_used
    AND o.expires_at > NOW()
    AND o.delivery_status IN ('sent', 'delivered')
  ORDER BY o.created_at DESC
  LIMIT 1
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'otp_expired');
  END IF;

  IF v_otp.locked_until IS NOT NULL AND v_otp.locked_until > NOW() THEN
    RETURN jsonb_build_object('error', 'locked', 'locked_until', v_otp.locked_until);
  END IF;

  UPDATE public.medical_record_otp_codes
  SET attempt_count = attempt_count + 1
  WHERE id = v_otp.id
  RETURNING attempt_count INTO v_new_attempt_count;

  v_hmac_secret := CASE v_otp.code_key_version
    WHEN 'v1' THEN current_setting('app.settings.medical_otp_hmac_key_v1', true)
    ELSE NULL
  END;

  IF v_hmac_secret IS NULL OR v_hmac_secret = '' THEN
    RAISE EXCEPTION 'OTP key material unavailable for key version %', v_otp.code_key_version;
  END IF;

  v_input_hmac := encode(
    hmac(btrim(p_code) || ':' || encode(v_otp.code_salt, 'hex'), v_hmac_secret, 'sha256'),
    'hex'
  );

  IF v_input_hmac <> v_otp.code_hmac THEN
    IF v_new_attempt_count >= v_otp.max_attempts THEN
      UPDATE public.medical_record_otp_codes
      SET locked_until = NOW() + INTERVAL '30 minutes'
      WHERE id = v_otp.id;

      RETURN jsonb_build_object('error', 'locked', 'locked_until', NOW() + INTERVAL '30 minutes');
    END IF;

    RETURN jsonb_build_object(
      'error', 'invalid_code',
      'attempts_remaining', GREATEST(v_otp.max_attempts - v_new_attempt_count, 0)
    );
  END IF;

  UPDATE public.medical_record_otp_codes
  SET is_used = true,
      validated_at = NOW(),
      delivery_status = 'delivered'
  WHERE id = v_otp.id;

  UPDATE public.medical_record_access_grants
  SET status = 'active',
      granted_at = NOW(),
      expires_at = NOW() + make_interval(secs => p_duration_seconds),
      duration_seconds = p_duration_seconds,
      consent_method = CASE
        WHEN v_otp.delivery_channel = 'sms' THEN 'otp_sms'
        WHEN v_otp.delivery_channel = 'email' THEN 'otp_email'
        ELSE 'otp_verbal'
      END,
      consent_recorded_at = NOW(),
      updated_at = NOW()
  WHERE id = p_grant_id
    AND status = 'pending_otp';

  PERFORM public._medical_insert_audit_log(
    v_user_id,
    v_grant.clinic_id,
    'medical_record_grant',
    p_grant_id,
    'activate',
    jsonb_build_object('method', 'otp', 'duration_seconds', p_duration_seconds)
  );

  RETURN (
    SELECT jsonb_build_object(
      'success', true,
      'grant_id', g.id,
      'expires_at', g.expires_at,
      'scope', g.scope
    )
    FROM public.medical_record_access_grants g
    WHERE g.id = p_grant_id
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.approve_medical_record_access(
  p_grant_id UUID,
  p_duration_seconds INT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_grant public.medical_record_access_grants%ROWTYPE;
BEGIN
  v_user_id := public._medical_assert_authenticated();

  IF p_grant_id IS NULL THEN
    RAISE EXCEPTION 'grant_id is required';
  END IF;

  IF p_duration_seconds IS NULL OR p_duration_seconds < 300 OR p_duration_seconds > 2592000 THEN
    RAISE EXCEPTION 'duration_seconds must be between 300 and 2592000';
  END IF;

  SELECT g.* INTO v_grant
  FROM public.medical_record_access_grants g
  JOIN public.patients p ON p.id = g.patient_id
  WHERE g.id = p_grant_id
    AND p.user_id = v_user_id
    AND NOT p.is_anonymized
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'not_your_grant');
  END IF;

  IF v_grant.status = 'active' AND v_grant.expires_at > NOW() AND v_grant.revoked_at IS NULL THEN
    RETURN jsonb_build_object('error', 'already_active', 'expires_at', v_grant.expires_at);
  END IF;

  IF v_grant.status <> 'pending_otp' THEN
    RETURN jsonb_build_object('error', 'invalid_grant_status', 'status', v_grant.status);
  END IF;

  UPDATE public.medical_record_access_grants
  SET status = 'active',
      granted_at = NOW(),
      expires_at = NOW() + make_interval(secs => p_duration_seconds),
      duration_seconds = p_duration_seconds,
      consent_method = 'in_app_confirm',
      consent_recorded_at = NOW(),
      updated_at = NOW()
  WHERE id = p_grant_id;

  PERFORM public._medical_insert_audit_log(
    v_user_id,
    v_grant.clinic_id,
    'medical_record_grant',
    p_grant_id,
    'activate_in_app',
    jsonb_build_object('duration_seconds', p_duration_seconds)
  );

  RETURN (
    SELECT jsonb_build_object(
      'success', true,
      'grant_id', g.id,
      'expires_at', g.expires_at
    )
    FROM public.medical_record_access_grants g
    WHERE g.id = p_grant_id
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.revoke_medical_record_access(
  p_grant_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_grant public.medical_record_access_grants%ROWTYPE;
BEGIN
  v_user_id := public._medical_assert_authenticated();

  IF p_grant_id IS NULL THEN
    RAISE EXCEPTION 'grant_id is required';
  END IF;

  SELECT g.* INTO v_grant
  FROM public.medical_record_access_grants g
  JOIN public.patients p ON p.id = g.patient_id
  WHERE g.id = p_grant_id
    AND p.user_id = v_user_id
    AND NOT p.is_anonymized
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'not_your_grant');
  END IF;

  IF v_grant.status NOT IN ('pending_otp', 'active') THEN
    RETURN jsonb_build_object('error', 'already_finalized', 'status', v_grant.status);
  END IF;

  UPDATE public.medical_record_access_grants
  SET status = 'revoked',
      revoked_at = NOW(),
      revoked_by = v_user_id,
      revocation_reason = COALESCE(v_grant.revocation_reason, 'patient_revoke'),
      updated_at = NOW()
  WHERE id = p_grant_id;

  PERFORM public._medical_insert_audit_log(
    v_user_id,
    v_grant.clinic_id,
    'medical_record_grant',
    p_grant_id,
    'revoke',
    jsonb_build_object('reason', 'patient_revoke')
  );

  RETURN jsonb_build_object('success', true, 'revoked_grant_id', p_grant_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.revoke_all_medical_record_access()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_patient_id UUID;
  v_revoked_count INT := 0;
BEGIN
  v_user_id := public._medical_assert_authenticated();

  SELECT p.id INTO v_patient_id
  FROM public.patients p
  WHERE p.user_id = v_user_id
    AND NOT p.is_anonymized
  LIMIT 1;

  IF v_patient_id IS NULL THEN
    RETURN jsonb_build_object('success', true, 'revoked_count', 0);
  END IF;

  WITH revoked AS (
    UPDATE public.medical_record_access_grants g
    SET status = 'revoked',
        revoked_at = NOW(),
        revoked_by = v_user_id,
        revocation_reason = 'kill_switch',
        updated_at = NOW()
    WHERE g.patient_id = v_patient_id
      AND g.status IN ('pending_otp', 'active')
    RETURNING g.id, g.clinic_id
  )
  SELECT COUNT(*) INTO v_revoked_count FROM revoked;

  INSERT INTO public.audit_logs (user_id, clinic_id, entity_type, entity_id, action, changes)
  SELECT
    v_user_id,
    r.clinic_id,
    'medical_record_grant',
    r.id,
    'revoke_all',
    jsonb_build_object('reason', 'kill_switch')
  FROM (
    SELECT g.id, g.clinic_id
    FROM public.medical_record_access_grants g
    WHERE g.patient_id = v_patient_id
      AND g.revoked_by = v_user_id
      AND g.revocation_reason = 'kill_switch'
      AND g.updated_at > NOW() - INTERVAL '5 seconds'
  ) r;

  RETURN jsonb_build_object('success', true, 'revoked_count', v_revoked_count);
END;
$$;

CREATE OR REPLACE FUNCTION public.revoke_walkin_access_with_token(
  p_grant_id UUID,
  p_stop_token TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_grant public.medical_record_access_grants%ROWTYPE;
BEGIN
  v_user_id := auth.uid();

  IF p_grant_id IS NULL THEN
    RAISE EXCEPTION 'grant_id is required';
  END IF;

  SELECT g.* INTO v_grant
  FROM public.medical_record_access_grants g
  JOIN public.patients p ON p.id = g.patient_id
  WHERE g.id = p_grant_id
    AND p.user_id IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'walkin_grant_not_found');
  END IF;

  IF v_grant.status NOT IN ('pending_otp', 'active') THEN
    RETURN jsonb_build_object('error', 'already_finalized', 'status', v_grant.status);
  END IF;

  IF COALESCE(v_user_id, '00000000-0000-0000-0000-000000000000'::uuid) = '00000000-0000-0000-0000-000000000000'::uuid THEN
    IF COALESCE(NULLIF(btrim(p_stop_token), ''), '') = '' THEN
      RETURN jsonb_build_object('error', 'stop_token_required');
    END IF;
  ELSE
    IF NOT public._user_can_manage_clinic(v_grant.clinic_id, v_user_id) THEN
      RETURN jsonb_build_object('error', 'not_authorized');
    END IF;
  END IF;

  UPDATE public.medical_record_access_grants
  SET status = 'revoked',
      revoked_at = NOW(),
      revoked_by = v_user_id,
      revocation_reason = 'walkin_stop',
      updated_at = NOW()
  WHERE id = p_grant_id;

  PERFORM public._medical_insert_audit_log(
    v_user_id,
    v_grant.clinic_id,
    'medical_record_grant',
    p_grant_id,
    'revoke_walkin',
    jsonb_build_object('token_supplied', COALESCE(NULLIF(btrim(p_stop_token), ''), '') <> '')
  );

  RETURN jsonb_build_object('success', true, 'revoked_grant_id', p_grant_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.resend_medical_record_otp(
  p_grant_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_grant public.medical_record_access_grants%ROWTYPE;
  v_last_otp public.medical_record_otp_codes%ROWTYPE;
  v_retry_after INT;
BEGIN
  v_user_id := public._medical_assert_authenticated();

  SELECT * INTO v_grant
  FROM public.medical_record_access_grants g
  WHERE g.id = p_grant_id
    AND g.grantee_user_id = v_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'not_authorized');
  END IF;

  IF v_grant.status <> 'pending_otp' THEN
    RETURN jsonb_build_object('error', 'invalid_grant_status', 'status', v_grant.status);
  END IF;

  SELECT * INTO v_last_otp
  FROM public.medical_record_otp_codes o
  WHERE o.grant_id = p_grant_id
  ORDER BY o.created_at DESC
  LIMIT 1;

  IF FOUND AND v_last_otp.created_at > NOW() - INTERVAL '30 seconds' THEN
    v_retry_after := GREATEST(0, 30 - EXTRACT(EPOCH FROM (NOW() - v_last_otp.created_at))::int);
    RETURN jsonb_build_object('error', 'cooldown', 'retry_after_seconds', v_retry_after);
  END IF;

  RETURN jsonb_build_object('success', true, 'grant_id', p_grant_id, 'ready_for_delivery', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.get_my_active_shares()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_patient_id UUID;
BEGIN
  v_user_id := public._medical_assert_authenticated();

  SELECT p.id INTO v_patient_id
  FROM public.patients p
  WHERE p.user_id = v_user_id
    AND NOT p.is_anonymized
  LIMIT 1;

  IF v_patient_id IS NULL THEN
    RETURN '[]'::jsonb;
  END IF;

  RETURN COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'id', g.id,
      'grantee_name', COALESCE(pr.full_name, 'Staff Member'),
      'clinic_name', c.name,
      'status', g.status,
      'granted_at', g.granted_at,
      'expires_at', g.expires_at,
      'consent_method', g.consent_method,
      'scope', g.scope,
      'access_count', COALESCE(al.access_count, 0)
    ) ORDER BY g.created_at DESC)
    FROM public.medical_record_access_grants g
    LEFT JOIN public.clinics c ON c.id = g.clinic_id
    LEFT JOIN public.profiles pr ON pr.id = g.grantee_user_id
    LEFT JOIN (
      SELECT grant_id, COUNT(*)::int AS access_count
      FROM public.medical_record_access_log
      GROUP BY grant_id
    ) al ON al.grant_id = g.id
    WHERE g.patient_id = v_patient_id
      AND g.status IN ('pending_otp', 'active')
  ), '[]'::jsonb);
END;
$$;

CREATE OR REPLACE FUNCTION public.check_active_grant_for_patient(
  p_patient_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_grant public.medical_record_access_grants%ROWTYPE;
BEGIN
  v_user_id := public._medical_assert_authenticated();

  SELECT * INTO v_grant
  FROM public.medical_record_access_grants g
  WHERE g.patient_id = p_patient_id
    AND g.grantee_user_id = v_user_id
    AND g.status = 'active'
    AND g.expires_at > NOW()
    AND g.revoked_at IS NULL
  ORDER BY g.created_at DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('has_access', false);
  END IF;

  RETURN jsonb_build_object(
    'has_access', true,
    'grant_id', v_grant.id,
    'expires_at', v_grant.expires_at
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_shared_appointment_history(
  p_grant_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_grant public.medical_record_access_grants%ROWTYPE;
  v_patient_display_name TEXT;
BEGIN
  v_user_id := public._medical_assert_authenticated();

  SELECT * INTO v_grant
  FROM public.medical_record_access_grants g
  WHERE g.id = p_grant_id
    AND g.grantee_user_id = v_user_id
    AND g.status = 'active'
    AND g.expires_at > NOW()
    AND g.revoked_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Active grant not found or expired' USING ERRCODE = '42501';
  END IF;

  SELECT p.display_name INTO v_patient_display_name
  FROM public.patients p
  WHERE p.id = v_grant.patient_id;

  INSERT INTO public.medical_record_access_log (
    grant_id,
    accessed_by,
    patient_id,
    patient_pseudonym,
    clinic_id,
    record_type,
    action
  ) VALUES (
    v_grant.id,
    v_user_id,
    v_grant.patient_id,
    COALESCE(v_patient_display_name, 'Patient'),
    v_grant.clinic_id,
    'appointment_history',
    'list'
  );

  RETURN COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'appointment_id', a.id,
      'date', a.appointment_date,
      'clinic_name', c.name,
      'doctor_name', COALESCE(pr.full_name, 'Staff Member'),
      'appointment_type', a.appointment_type,
      'status', a.status,
      'has_diagnoses', EXISTS (
        SELECT 1 FROM public.medical_record_diagnoses d
        WHERE d.appointment_id = a.id AND d.is_patient_visible = true
      ),
      'has_notes', COALESCE(NULLIF(btrim(a.notes), ''), NULL) IS NOT NULL,
      'has_prescriptions', EXISTS (
        SELECT 1 FROM public.medical_record_prescriptions p
        WHERE p.appointment_id = a.id AND p.is_patient_visible = true
      ),
      'has_lab_results', EXISTS (
        SELECT 1 FROM public.medical_record_lab_results l
        WHERE l.appointment_id = a.id AND l.is_patient_visible = true
      )
    ) ORDER BY a.appointment_date DESC, COALESCE(a.scheduled_time, '00:00') DESC)
    FROM public.appointments a
    LEFT JOIN public.clinics c ON c.id = a.clinic_id
    LEFT JOIN public.clinic_staff cs ON cs.id = a.staff_id
    LEFT JOIN public.profiles pr ON pr.id = cs.user_id
    WHERE a.patient_id = v_grant.patient_id
      AND a.status IN ('completed', 'in_progress')
      AND public._medical_scope_allows_appointment(v_grant.scope, a.id, a.appointment_date)
  ), '[]'::jsonb);
END;
$$;

CREATE OR REPLACE FUNCTION public.get_shared_appointment_detail(
  p_grant_id UUID,
  p_appointment_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_grant public.medical_record_access_grants%ROWTYPE;
  v_appointment public.appointments%ROWTYPE;
  v_patient_display_name TEXT;
BEGIN
  v_user_id := public._medical_assert_authenticated();

  SELECT * INTO v_grant
  FROM public.medical_record_access_grants g
  WHERE g.id = p_grant_id
    AND g.grantee_user_id = v_user_id
    AND g.status = 'active'
    AND g.expires_at > NOW()
    AND g.revoked_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Active grant not found or expired' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_appointment
  FROM public.appointments a
  WHERE a.id = p_appointment_id
    AND a.patient_id = v_grant.patient_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Appointment not found for granted patient';
  END IF;

  IF NOT public._medical_scope_allows_appointment(v_grant.scope, v_appointment.id, v_appointment.appointment_date) THEN
    RAISE EXCEPTION 'Appointment outside granted scope' USING ERRCODE = '42501';
  END IF;

  SELECT p.display_name INTO v_patient_display_name
  FROM public.patients p
  WHERE p.id = v_grant.patient_id;

  INSERT INTO public.medical_record_access_log (
    grant_id,
    accessed_by,
    patient_id,
    patient_pseudonym,
    clinic_id,
    record_type,
    record_id,
    action
  ) VALUES (
    v_grant.id,
    v_user_id,
    v_grant.patient_id,
    COALESCE(v_patient_display_name, 'Patient'),
    v_grant.clinic_id,
    'appointment_detail',
    p_appointment_id,
    'view'
  );

  RETURN (
    SELECT jsonb_build_object(
      'appointment_id', a.id,
      'date', a.appointment_date,
      'clinic_name', c.name,
      'doctor_name', COALESCE(pr.full_name, 'Staff Member'),
      'appointment_type', a.appointment_type,
      'status', a.status,
      'has_diagnoses', EXISTS (
        SELECT 1 FROM public.medical_record_diagnoses d
        WHERE d.appointment_id = a.id AND d.is_patient_visible = true
      ),
      'has_notes', COALESCE(NULLIF(btrim(a.notes), ''), NULL) IS NOT NULL,
      'has_prescriptions', EXISTS (
        SELECT 1 FROM public.medical_record_prescriptions p
        WHERE p.appointment_id = a.id AND p.is_patient_visible = true
      ),
      'has_lab_results', EXISTS (
        SELECT 1 FROM public.medical_record_lab_results l
        WHERE l.appointment_id = a.id AND l.is_patient_visible = true
      ),
      'reason_for_visit', a.reason_for_visit,
      'notes', a.notes,
      'duration_minutes', a.actual_duration,
      'diagnoses', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'id', d.id,
          'diagnosisCode', d.diagnosis_code,
          'diagnosisLabel', d.diagnosis_label,
          'diagnosisNotes', d.diagnosis_notes
        ) ORDER BY d.created_at DESC)
        FROM public.medical_record_diagnoses d
        WHERE d.appointment_id = a.id
          AND d.is_patient_visible = true
      ), '[]'::jsonb),
      'prescriptions', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'id', p.id,
          'medicationName', p.medication_name,
          'dosage', p.dosage,
          'route', p.route,
          'frequency', p.frequency,
          'durationDays', p.duration_days,
          'instructions', p.instructions
        ) ORDER BY p.created_at DESC)
        FROM public.medical_record_prescriptions p
        WHERE p.appointment_id = a.id
          AND p.is_patient_visible = true
      ), '[]'::jsonb),
      'lab_results', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'id', l.id,
          'testName', l.test_name,
          'resultValue', l.result_value,
          'unit', l.unit,
          'referenceRange', l.reference_range,
          'interpretation', l.interpretation
        ) ORDER BY l.created_at DESC)
        FROM public.medical_record_lab_results l
        WHERE l.appointment_id = a.id
          AND l.is_patient_visible = true
      ), '[]'::jsonb)
    )
    FROM public.appointments a
    LEFT JOIN public.clinics c ON c.id = a.clinic_id
    LEFT JOIN public.clinic_staff cs ON cs.id = a.staff_id
    LEFT JOIN public.profiles pr ON pr.id = cs.user_id
    WHERE a.id = p_appointment_id
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.expire_stale_medical_record_grants()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_expired_active INT := 0;
  v_expired_pending INT := 0;
BEGIN
  PERFORM public._medical_assert_service_role();

  UPDATE public.medical_record_access_grants
  SET status = 'expired',
      updated_at = NOW()
  WHERE status = 'active'
    AND expires_at <= NOW();

  GET DIAGNOSTICS v_expired_active = ROW_COUNT;

  UPDATE public.medical_record_access_grants
  SET status = 'expired',
      updated_at = NOW()
  WHERE status = 'pending_otp'
    AND created_at < NOW() - INTERVAL '30 minutes';

  GET DIAGNOSTICS v_expired_pending = ROW_COUNT;

  RETURN jsonb_build_object(
    'expired_active', v_expired_active,
    'expired_pending', v_expired_pending
  );
END;
$$;


-- =====================================================================================
-- Grants
-- =====================================================================================

GRANT EXECUTE ON FUNCTION public.request_medical_record_access(UUID, UUID, UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.validate_medical_record_otp(UUID, TEXT, INT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.approve_medical_record_access(UUID, INT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_medical_record_access(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_all_medical_record_access() TO authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_walkin_access_with_token(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.resend_medical_record_otp(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_active_shares() TO authenticated;
GRANT EXECUTE ON FUNCTION public.check_active_grant_for_patient(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_shared_appointment_history(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_shared_appointment_detail(UUID, UUID) TO authenticated;

GRANT EXECUTE ON FUNCTION public.get_medical_record_delivery_contact_for_service(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_medical_record_otp_for_delivery(UUID, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.finalize_medical_record_otp_delivery(UUID, BOOLEAN, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.expire_stale_medical_record_grants() TO service_role;

REVOKE EXECUTE ON FUNCTION public.get_medical_record_delivery_contact_for_service(UUID) FROM authenticated, anon;
REVOKE EXECUTE ON FUNCTION public.claim_medical_record_otp_for_delivery(UUID, UUID) FROM authenticated, anon;
REVOKE EXECUTE ON FUNCTION public.finalize_medical_record_otp_delivery(UUID, BOOLEAN, TEXT) FROM authenticated, anon;
REVOKE EXECUTE ON FUNCTION public.expire_stale_medical_record_grants() FROM authenticated, anon;
