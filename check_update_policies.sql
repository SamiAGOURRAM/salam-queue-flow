-- Check RLS policies on appointments table for UPDATE operations
SELECT 
    schemaname,
    tablename,
    policyname,
    permissive,
    roles,
    cmd,
    qual,
    with_check
FROM pg_policies 
WHERE tablename = 'appointments' 
  AND cmd IN ('UPDATE', 'ALL')
ORDER BY policyname;
