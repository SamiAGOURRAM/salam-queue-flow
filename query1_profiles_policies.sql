-- Query 1: Policies on profiles table
SELECT 
    tablename,
    policyname,
    cmd,
    qual as using_expression
FROM pg_policies
WHERE tablename = 'profiles'
AND cmd IN ('SELECT', 'ALL')
ORDER BY policyname;
