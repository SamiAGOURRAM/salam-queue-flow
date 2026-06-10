-- Add queue absence notification types to match application notification domain models.
ALTER TYPE public.notification_type ADD VALUE IF NOT EXISTS 'patient_absent';
ALTER TYPE public.notification_type ADD VALUE IF NOT EXISTS 'grace_period_ending';
