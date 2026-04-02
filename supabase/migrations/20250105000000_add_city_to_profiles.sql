-- Migration: Add city field to profiles table
-- Date: January 2025
-- Purpose: Add city field to support patient location information

-- Add city column to profiles table
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS city text null;

-- Add comment
COMMENT ON COLUMN public.profiles.city IS 'Patient city/location for better appointment recommendations and clinic search';

-- Note: No default value needed as it's nullable
-- Existing rows will have NULL for city

