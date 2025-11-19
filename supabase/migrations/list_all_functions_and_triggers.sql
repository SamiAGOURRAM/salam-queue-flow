-- Script: List all User-Defined Functions and Triggers
-- Run this in your Supabase SQL Editor to get definitions

-- 1. Get all Functions (excluding system functions)
SELECT 
    n.nspname as schema_name,
    p.proname as function_name,
    pg_get_function_arguments(p.oid) as arguments,
    pg_get_function_result(p.oid) as return_type,
    pg_get_functiondef(p.oid) as definition
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public' -- Only public schema
  AND p.prokind = 'f' -- Only functions (not procedures or aggregates)
ORDER BY p.proname;

-- 2. Get all Triggers
SELECT 
    event_object_table as table_name,
    trigger_name,
    event_manipulation as event,
    action_statement as definition,
    action_timing as timing
FROM information_schema.triggers
WHERE event_object_schema = 'public'
ORDER BY table_name, trigger_name;

