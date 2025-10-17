-- Check the status column type and constraints
SELECT 
    column_name,
    data_type,
    udt_name,
    is_nullable,
    column_default
FROM information_schema.columns
WHERE table_name = 'appointments' 
  AND column_name = 'status';

-- Also check the enum values for appointment_status type
SELECT 
    t.typname as enum_name,
    e.enumlabel as enum_value
FROM pg_type t 
JOIN pg_enum e ON t.oid = e.enumtypid  
WHERE t.typname = 'appointment_status'
ORDER BY e.enumsortorder;
