-- Update the handle_new_user trigger to also create the user role
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- Insert profile
  INSERT INTO public.profiles (id, phone_number, full_name, email)
  VALUES (
    NEW.id, 
    COALESCE(NEW.phone, NEW.raw_user_meta_data->>'phone_number', ''),
    COALESCE(NEW.raw_user_meta_data->>'full_name', 'User'),
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