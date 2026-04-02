-- Migration: Fix handle_new_user create_patient resolution for auth trigger context
-- Purpose: Ensure signup trigger can always resolve patient creation function

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_full_name TEXT;
  v_phone TEXT;
  v_email TEXT;
BEGIN
  v_full_name := COALESCE(NEW.raw_user_meta_data->>'full_name', '');
  v_phone := COALESCE(NEW.raw_user_meta_data->>'phone_number', '');
  v_email := NEW.email;

  INSERT INTO public.profiles (id, full_name, email, phone_number)
  VALUES (NEW.id, v_full_name, v_email, v_phone);

  IF v_phone != '' OR v_email != '' THEN
    PERFORM public.create_patient(
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
