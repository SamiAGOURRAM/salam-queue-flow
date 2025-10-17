-- Check the update_patient_history function
SELECT pg_get_functiondef(oid)
FROM pg_proc
WHERE proname = 'update_patient_history';
