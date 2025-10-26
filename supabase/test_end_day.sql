-- =============================================
-- END DAY RPC TESTING SCRIPT
-- Test the end_day_for_staff function
-- =============================================

-- Step 1: Get a test clinic and staff
SELECT 
  c.id as clinic_id,
  cs.id as staff_id,
  cs.user_id,
  c.name as clinic_name
FROM clinics c
JOIN clinic_staff cs ON cs.clinic_id = c.id
LIMIT 1;

-- Use the IDs from above in the following tests
-- Replace these with actual values from your database:
\set clinic_id 'YOUR_CLINIC_ID_HERE'
\set staff_id 'YOUR_STAFF_ID_HERE'
\set user_id 'YOUR_USER_ID_HERE'

-- =============================================
-- Test 1: Get Preview (Read-Only)
-- =============================================
SELECT get_day_closure_preview(
  :'staff_id'::UUID,
  :'clinic_id'::UUID,
  CURRENT_DATE
);

-- =============================================
-- Test 2: View Current Appointments
-- =============================================
SELECT 
  id,
  queue_position,
  status,
  appointment_type,
  is_present,
  skip_reason,
  checked_in_at,
  actual_start_time
FROM appointments
WHERE clinic_id = :'clinic_id'::UUID
AND staff_id = :'staff_id'::UUID
AND appointment_date = CURRENT_DATE
ORDER BY queue_position;

-- =============================================
-- Test 3: End Day (Actual Closure)
-- WARNING: This will modify data!
-- =============================================
-- Uncomment the following to actually close the day:

/*
SELECT end_day_for_staff(
  p_staff_id := :'staff_id'::UUID,
  p_clinic_id := :'clinic_id'::UUID,
  p_closure_date := CURRENT_DATE,
  p_performed_by := :'user_id'::UUID,
  p_reason := 'Test closure - End of day',
  p_notes := 'Testing the end day functionality'
);
*/

-- =============================================
-- Test 4: Verify Changes After Closure
-- =============================================
/*
SELECT 
  id,
  queue_position,
  status,
  appointment_type,
  is_present,
  actual_end_time,
  updated_at
FROM appointments
WHERE clinic_id = :'clinic_id'::UUID
AND staff_id = :'staff_id'::UUID
AND appointment_date = CURRENT_DATE
ORDER BY queue_position;
*/

-- =============================================
-- Test 5: View Closure Audit Record
-- =============================================
/*
SELECT 
  id,
  closure_date,
  performed_at,
  total_appointments,
  waiting_count,
  in_progress_count,
  absent_count,
  completed_count,
  array_length(marked_no_show_ids, 1) as marked_no_show_count,
  array_length(marked_completed_ids, 1) as marked_completed_count,
  reason,
  notes,
  can_reopen,
  reopened_at
FROM clinic_day_closures
WHERE clinic_id = :'clinic_id'::UUID
AND staff_id = :'staff_id'::UUID
AND closure_date = CURRENT_DATE;
*/

-- =============================================
-- Test 6: Reopen Day (Emergency Rollback)
-- =============================================
-- Get the closure ID first:
/*
\set closure_id (SELECT id FROM clinic_day_closures WHERE clinic_id = :'clinic_id'::UUID AND staff_id = :'staff_id'::UUID AND closure_date = CURRENT_DATE AND reopened_at IS NULL LIMIT 1)

SELECT reopen_day_for_staff(
  p_closure_id := :'closure_id'::UUID,
  p_performed_by := :'user_id'::UUID,
  p_reason := 'Test reopening - mistake'
);
*/

-- =============================================
-- Test 7: Verify Restored Appointments
-- =============================================
/*
SELECT 
  id,
  queue_position,
  status,
  appointment_type,
  is_present,
  actual_end_time
FROM appointments
WHERE clinic_id = :'clinic_id'::UUID
AND staff_id = :'staff_id'::UUID
AND appointment_date = CURRENT_DATE
ORDER BY queue_position;
*/

-- =============================================
-- QUICK TEST (without variables)
-- Replace the UUIDs with actual values
-- =============================================

-- Preview only (safe):
/*
SELECT get_day_closure_preview(
  'YOUR_STAFF_ID'::UUID,
  'YOUR_CLINIC_ID'::UUID,
  '2025-10-26'::DATE
);
*/

-- Full closure (destructive):
/*
SELECT end_day_for_staff(
  p_staff_id := 'YOUR_STAFF_ID'::UUID,
  p_clinic_id := 'YOUR_CLINIC_ID'::UUID,
  p_closure_date := '2025-10-26'::DATE,
  p_performed_by := 'YOUR_USER_ID'::UUID,
  p_reason := 'End of day',
  p_notes := NULL
);
*/
