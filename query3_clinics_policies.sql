-- Query 3: Policies on clinics table
SELECT 
    tablename,
    policyname,
    cmd,
    qual as using_expression
FROM pg_policies
WHERE tablename = 'clinics'
AND cmd IN ('SELECT', 'ALL')
ORDER BY policyname;
