-- Check the calculate_appointment_features function
SELECT pg_get_functiondef(oid)
FROM pg_proc
WHERE proname = 'calculate_appointment_features';
