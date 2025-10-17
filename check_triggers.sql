-- Check triggers on appointments table that might block updates
SELECT 
    trigger_name,
    event_manipulation,
    action_timing,
    action_statement
FROM information_schema.triggers
WHERE event_object_table = 'appointments'
ORDER BY trigger_name;
