-- Script: Check for Redundant Functions
-- Description: Checks existing functions for redundancy and proper cleaning

-- 1. Check for old backup tables
SELECT tablename FROM pg_tables WHERE tablename LIKE '%backup%' AND schemaname = 'public';

-- 2. Check for duplicate triggers on appointments
SELECT trigger_name, event_manipulation, action_statement 
FROM information_schema.triggers 
WHERE event_object_table = 'appointments'
ORDER BY event_manipulation;

-- 3. Analyze "is_first_visit" calculation performance risk
EXPLAIN ANALYZE 
SELECT COUNT(*) = 0 
FROM appointments 
WHERE patient_id = '00000000-0000-0000-0000-000000000000' -- Dummy ID
  AND status IN ('completed', 'cancelled');

