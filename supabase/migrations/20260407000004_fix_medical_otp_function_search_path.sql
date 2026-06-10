-- Ensure OTP RPCs can resolve pgcrypto helpers (hmac, gen_random_bytes)
-- when pgcrypto is installed in the extensions schema.

ALTER FUNCTION public.claim_medical_record_otp_for_delivery(UUID, UUID)
  SET search_path = public, extensions;

ALTER FUNCTION public.validate_medical_record_otp(UUID, TEXT, INT)
  SET search_path = public, extensions;
