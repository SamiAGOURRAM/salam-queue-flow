-- Check the actual structure of absent_patients table

SELECT 
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns
WHERE table_name = 'absent_patients'
ORDER BY ordinal_position;
