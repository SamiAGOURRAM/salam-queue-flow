-- Query 2: Policies on guest_patients table
SELECT 
    tablename,
    policyname,
    cmd,
    qual as using_expression
FROM pg_policies
WHERE tablename = 'guest_patients'
AND cmd IN ('SELECT', 'ALL')
ORDER BY policyname;
