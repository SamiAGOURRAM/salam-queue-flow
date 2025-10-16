-- Fix profiles table to allow optional phone numbers
-- This fixes the "Database error saving new user" issue

-- Make phone_number optional (nullable) instead of required
ALTER TABLE public.profiles 
  ALTER COLUMN phone_number DROP NOT NULL;

-- Update the unique constraint to allow multiple NULL values
-- (PostgreSQL allows multiple NULLs in UNIQUE columns by default)
-- But if there's an issue, we can create a partial unique index
DROP INDEX IF EXISTS profiles_phone_number_key;

CREATE UNIQUE INDEX profiles_phone_number_unique 
  ON public.profiles(phone_number) 
  WHERE phone_number IS NOT NULL AND phone_number != '';

-- Update the trigger to handle empty phone numbers better
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_phone TEXT;
BEGIN
  -- Get phone number, set to NULL if empty
  v_phone := COALESCE(
    NULLIF(TRIM(NEW.phone), ''),
    NULLIF(TRIM(NEW.raw_user_meta_data->>'phone_number'), '')
  );

  -- Insert profile
  INSERT INTO public.profiles (id, phone_number, full_name, email)
  VALUES (
    NEW.id, 
    v_phone,
    COALESCE(NULLIF(TRIM(NEW.raw_user_meta_data->>'full_name'), ''), 'User'),
    NEW.email
  );
  
  -- Insert user role based on metadata (defaults to 'patient' if not specified)
  INSERT INTO public.user_roles (user_id, role, clinic_id)
  VALUES (
    NEW.id,
    COALESCE((NEW.raw_user_meta_data->>'role')::app_role, 'patient'),
    NULL
  );
  
  RETURN NEW;
END;
$function$;
