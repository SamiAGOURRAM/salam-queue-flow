-- Fix signup error: "Database error saving new user"
-- Root cause: handle_new_user() was setting empty string for phone_number
-- This causes UNIQUE constraint violation when multiple users signup without phone

-- Step 1: Update the handle_new_user trigger function to NOT use empty strings
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_phone TEXT;
  v_full_name TEXT;
  v_role app_role;
BEGIN
  -- Get phone number - CRITICAL: Never use empty string, use actual value or fail
  v_phone := COALESCE(
    NULLIF(TRIM(NEW.phone), ''),
    NULLIF(TRIM(NEW.raw_user_meta_data->>'phone_number'), '')
  );
  
  -- Phone is mandatory - if not provided, raise error with clear message
  IF v_phone IS NULL THEN
    RAISE EXCEPTION 'Phone number is required for signup. Please provide a valid phone number.';
  END IF;
  
  -- Get full name
  v_full_name := COALESCE(
    NULLIF(TRIM(NEW.raw_user_meta_data->>'full_name'), ''),
    NULLIF(TRIM(NEW.raw_user_meta_data->>'name'), ''),
    'User'
  );
  
  -- Get role
  v_role := COALESCE((NEW.raw_user_meta_data->>'role')::app_role, 'patient');

  -- Insert profile with validated phone number
  INSERT INTO public.profiles (id, phone_number, full_name, email)
  VALUES (
    NEW.id, 
    v_phone,  -- Guaranteed to be non-null, non-empty
    v_full_name,
    NEW.email
  )
  ON CONFLICT (id) DO UPDATE
  SET
    phone_number = EXCLUDED.phone_number,
    full_name = EXCLUDED.full_name,
    email = EXCLUDED.email,
    updated_at = NOW();
  
  -- Insert user role
  INSERT INTO public.user_roles (user_id, role, clinic_id)
  VALUES (
    NEW.id,
    v_role,
    NULL
  )
  ON CONFLICT (user_id, role) DO NOTHING;
  
  RETURN NEW;
EXCEPTION
  WHEN unique_violation THEN
    -- If phone number already exists, provide clear error
    RAISE EXCEPTION 'This phone number is already registered. Please use a different phone number or sign in.';
  WHEN OTHERS THEN
    -- Re-raise other errors with context
    RAISE EXCEPTION 'Error creating user profile: %', SQLERRM;
END;
$function$;

-- Step 2: Ensure the trigger is properly set
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- Step 3: Clean up any existing profiles with empty phone strings
-- This prevents future conflicts
UPDATE public.profiles 
SET phone_number = '+212000000000' 
WHERE phone_number = '' OR phone_number IS NULL;

-- Step 4: Ensure phone_number is NOT NULL and UNIQUE
-- (Should already be the case, but let's be explicit)
ALTER TABLE public.profiles 
  ALTER COLUMN phone_number SET NOT NULL;

-- Recreate unique constraint if needed
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'profiles_phone_number_key'
    ) THEN
        ALTER TABLE public.profiles 
        ADD CONSTRAINT profiles_phone_number_key UNIQUE (phone_number);
    END IF;
END $$;

-- Success message
DO $$
BEGIN
  RAISE NOTICE 'Migration completed successfully. Phone number is now mandatory and properly validated.';
END $$;
