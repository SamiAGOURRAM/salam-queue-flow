-- Check foreign key constraints on absent_patients table

SELECT
    conname as constraint_name,
    conrelid::regclass as table_name,
    confrelid::regclass as foreign_table,
    a.attname as column_name,
    af.attname as foreign_column
FROM pg_constraint c
JOIN pg_attribute a ON a.attnum = ANY(c.conkey) AND a.attrelid = c.conrelid
JOIN pg_attribute af ON af.attnum = ANY(c.confkey) AND af.attrelid = c.confrelid
WHERE conrelid = 'absent_patients'::regclass
AND contype = 'f'
ORDER BY conname;
