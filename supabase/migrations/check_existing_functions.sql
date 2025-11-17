-- Query to check existing function signatures
-- Run this first to see what functions exist

SELECT 
  p.proname AS function_name,
  pg_get_function_arguments(p.oid) AS arguments,
  pg_get_function_result(p.oid) AS return_type,
  p.oid::regprocedure AS full_signature
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public'
  AND p.proname IN ('get_daily_schedule_for_clinic', 'get_daily_schedule_for_staff')
ORDER BY p.proname, pg_get_function_arguments(p.oid);

