-- Check current structure of patient_clinic_history table
SELECT 
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns
WHERE table_name = 'patient_clinic_history'
ORDER BY ordinal_position;

-- Check existing constraints
SELECT 
    conname as constraint_name,
    contype as constraint_type,
    pg_get_constraintdef(oid) as definition
FROM pg_constraint
WHERE conrelid = 'patient_clinic_history'::regclass
ORDER BY conname;

-- Check existing indexes
SELECT 
    indexname,
    indexdef
FROM pg_indexes
WHERE tablename = 'patient_clinic_history'
ORDER BY indexname;
