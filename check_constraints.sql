-- Check all foreign key constraints on appointments table
SELECT 
    conname as constraint_name,
    contype as constraint_type,
    pg_get_constraintdef(oid) as constraint_definition
FROM pg_constraint 
WHERE conrelid = 'public.appointments'::regclass 
  AND contype = 'f'
ORDER BY conname;
