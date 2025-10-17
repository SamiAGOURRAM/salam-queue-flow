-- Alternative solution: Disable RLS on queue_overrides and use application-level checks
-- Or create a simpler policy that doesn't reference the inserted row

-- Option 1: Check if there's a BEFORE INSERT trigger we can leverage
SELECT 
    trigger_name,
    event_manipulation,
    action_statement
FROM information_schema.triggers
WHERE event_object_table = 'queue_overrides'
ORDER BY trigger_name;

-- Option 2: Check the actual policy definition more carefully
SELECT 
    pg_get_expr(polqual, polrelid) as using_qual,
    pg_get_expr(polwithcheck, polrelid) as with_check_qual
FROM pg_policy
WHERE polname = 'Staff can create queue overrides'
AND polrelid = 'queue_overrides'::regclass;
