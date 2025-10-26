-- ============================================================
-- TEST SUITE FOR search_clinics_v2()
-- ============================================================
-- This file contains comprehensive tests for the new availability-aware
-- clinic search function.
--
-- Run these tests AFTER executing the migration:
-- supabase/migrations/20251026000002_search_with_real_availability.sql
-- ============================================================

-- ============================================================
-- SETUP: Create sample data for testing
-- ============================================================

-- Test Clinic 1: "Clinique Salam Dental"
-- Working hours: Mon-Fri 9h-18h, Sat 9h-13h
-- Staff: Dr. Ahmed (Mon-Wed 9h-12h), Dr. Sara (Mon-Fri 14h-18h)
DO $$
DECLARE
  v_clinic_id UUID;
  v_staff_ahmed_id UUID;
  v_staff_sara_id UUID;
BEGIN
  -- Insert test clinic (if not exists)
  INSERT INTO clinics (
    id, name, specialty, city, address, phone, owner_id,
    settings
  )
  VALUES (
    '00000000-0000-0000-0000-000000000001',
    'Clinique Salam Dental Test',
    'Dentaire',
    'Casablanca',
    '123 Rue Test, Casablanca',
    '+212600000001',
    auth.uid(), -- Replace with actual owner_id
    '{
      "working_hours": {
        "monday": {"open": "09:00", "close": "18:00"},
        "tuesday": {"open": "09:00", "close": "18:00"},
        "wednesday": {"open": "09:00", "close": "18:00"},
        "thursday": {"open": "09:00", "close": "18:00"},
        "friday": {"open": "09:00", "close": "18:00"},
        "saturday": {"open": "09:00", "close": "13:00"},
        "sunday": {"closed": true}
      }
    }'::JSONB
  )
  ON CONFLICT (id) DO NOTHING;
  
  v_clinic_id := '00000000-0000-0000-0000-000000000001';
  
  -- Insert test staff (if not exists)
  INSERT INTO clinic_staff (id, clinic_id, user_id, name, role, is_active)
  VALUES 
    ('00000000-0000-0000-0000-000000000011', v_clinic_id, auth.uid(), 'Dr. Ahmed Test', 'doctor', true),
    ('00000000-0000-0000-0000-000000000012', v_clinic_id, auth.uid(), 'Dr. Sara Test', 'doctor', true)
  ON CONFLICT (id) DO NOTHING;
  
  v_staff_ahmed_id := '00000000-0000-0000-0000-000000000011';
  v_staff_sara_id := '00000000-0000-0000-0000-000000000012';
  
  -- Insert resource availabilities
  -- Dr. Ahmed: Monday-Wednesday 9h-12h
  INSERT INTO resource_availabilities (staff_id, day_of_week, start_time, end_time)
  VALUES 
    (v_staff_ahmed_id, 1, '09:00', '12:00'), -- Monday
    (v_staff_ahmed_id, 2, '09:00', '12:00'), -- Tuesday
    (v_staff_ahmed_id, 3, '09:00', '12:00')  -- Wednesday
  ON CONFLICT DO NOTHING;
  
  -- Dr. Sara: Monday-Friday 14h-18h
  INSERT INTO resource_availabilities (staff_id, day_of_week, start_time, end_time)
  SELECT v_staff_sara_id, day, '14:00'::TIME, '18:00'::TIME
  FROM generate_series(1, 5) AS day
  ON CONFLICT DO NOTHING;
  
  RAISE NOTICE 'Test data setup complete';
END $$;

-- ============================================================
-- TEST 1: Basic search (no date/time filters)
-- Expected: Should work like V1, return all matching clinics
-- ============================================================

SELECT '=== TEST 1: Basic Search ===' AS test_name;

SELECT 
  id,
  name,
  specialty,
  city,
  staff_available_count,
  today_hours
FROM search_clinics_v2('{
  "search": "test",
  "city": "Casablanca"
}'::JSONB);

-- Expected: Shows "Clinique Salam Dental Test" with staff_available_count = 0 (no date filter)

-- ============================================================
-- TEST 2: Search with date only (Monday, no time slot)
-- Expected: Should show clinics with ANY staff available on Monday
-- ============================================================

SELECT '=== TEST 2: Date Filter Only (Next Monday) ===' AS test_name;

-- Calculate next Monday
WITH next_monday AS (
  SELECT (CURRENT_DATE + (8 - EXTRACT(ISODOW FROM CURRENT_DATE))::INTEGER) AS date
)
SELECT 
  id,
  name,
  staff_available_count,
  CASE 
    WHEN staff_available_count > 0 THEN '✅ PASS'
    ELSE '❌ FAIL'
  END AS test_result
FROM search_clinics_v2(
  jsonb_build_object(
    'search', 'test',
    'selectedDate', (SELECT date FROM next_monday)::TEXT
  )
);

-- Expected: staff_available_count = 2 (Dr. Ahmed + Dr. Sara both available on Monday)

-- ============================================================
-- TEST 3: Monday Morning (8h-12h)
-- Expected: Only Dr. Ahmed available (9h-12h intersects 8h-12h)
-- ============================================================

SELECT '=== TEST 3: Monday Morning (8h-12h) ===' AS test_name;

WITH next_monday AS (
  SELECT (CURRENT_DATE + (8 - EXTRACT(ISODOW FROM CURRENT_DATE))::INTEGER) AS date
)
SELECT 
  id,
  name,
  staff_available_count,
  CASE 
    WHEN staff_available_count = 1 THEN '✅ PASS (Dr. Ahmed only)'
    ELSE '❌ FAIL (Expected 1, got ' || staff_available_count || ')'
  END AS test_result
FROM search_clinics_v2(
  jsonb_build_object(
    'search', 'test',
    'selectedDate', (SELECT date FROM next_monday)::TEXT,
    'timeSlotStart', '08:00',
    'timeSlotEnd', '12:00'
  )
);

-- Expected: staff_available_count = 1

-- ============================================================
-- TEST 4: Monday Afternoon (12h-17h)
-- Expected: Only Dr. Sara available (14h-18h intersects 12h-17h)
-- ============================================================

SELECT '=== TEST 4: Monday Afternoon (12h-17h) ===' AS test_name;

WITH next_monday AS (
  SELECT (CURRENT_DATE + (8 - EXTRACT(ISODOW FROM CURRENT_DATE))::INTEGER) AS date
)
SELECT 
  id,
  name,
  staff_available_count,
  CASE 
    WHEN staff_available_count = 1 THEN '✅ PASS (Dr. Sara only)'
    ELSE '❌ FAIL (Expected 1, got ' || staff_available_count || ')'
  END AS test_result
FROM search_clinics_v2(
  jsonb_build_object(
    'search', 'test',
    'selectedDate', (SELECT date FROM next_monday)::TEXT,
    'timeSlotStart', '12:00',
    'timeSlotEnd', '17:00'
  )
);

-- Expected: staff_available_count = 1

-- ============================================================
-- TEST 5: Monday Evening (17h-20h)
-- Expected: Only Dr. Sara available (14h-18h intersects 17h-20h)
-- ============================================================

SELECT '=== TEST 5: Monday Evening (17h-20h) ===' AS test_name;

WITH next_monday AS (
  SELECT (CURRENT_DATE + (8 - EXTRACT(ISODOW FROM CURRENT_DATE))::INTEGER) AS date
)
SELECT 
  id,
  name,
  staff_available_count,
  CASE 
    WHEN staff_available_count = 1 THEN '✅ PASS (Dr. Sara 14h-18h intersects 17h-20h)'
    ELSE '❌ FAIL (Expected 1, got ' || staff_available_count || ')'
  END AS test_result
FROM search_clinics_v2(
  jsonb_build_object(
    'search', 'test',
    'selectedDate', (SELECT date FROM next_monday)::TEXT,
    'timeSlotStart', '17:00',
    'timeSlotEnd', '20:00'
  )
);

-- Expected: staff_available_count = 1

-- ============================================================
-- TEST 6: Sunday (clinic closed)
-- Expected: staff_available_count = 0
-- ============================================================

SELECT '=== TEST 6: Sunday (Closed Day) ===' AS test_name;

WITH next_sunday AS (
  SELECT (CURRENT_DATE + (7 - EXTRACT(ISODOW FROM CURRENT_DATE))::INTEGER + 7) AS date
)
SELECT 
  id,
  name,
  staff_available_count,
  CASE 
    WHEN staff_available_count = 0 THEN '✅ PASS (No staff on Sunday)'
    ELSE '❌ FAIL (Expected 0, got ' || staff_available_count || ')'
  END AS test_result
FROM search_clinics_v2(
  jsonb_build_object(
    'search', 'test',
    'selectedDate', (SELECT date FROM next_sunday)::TEXT,
    'timeSlotStart', '09:00',
    'timeSlotEnd', '12:00'
  )
);

-- Expected: staff_available_count = 0

-- ============================================================
-- TEST 7: Thursday (only Dr. Sara available)
-- Expected: staff_available_count = 1
-- ============================================================

SELECT '=== TEST 7: Thursday Afternoon (Dr. Ahmed NOT available) ===' AS test_name;

WITH next_thursday AS (
  SELECT (CURRENT_DATE + (11 - EXTRACT(ISODOW FROM CURRENT_DATE))::INTEGER) AS date
)
SELECT 
  id,
  name,
  staff_available_count,
  CASE 
    WHEN staff_available_count = 1 THEN '✅ PASS (Only Dr. Sara on Thursday)'
    ELSE '❌ FAIL (Expected 1, got ' || staff_available_count || ')'
  END AS test_result
FROM search_clinics_v2(
  jsonb_build_object(
    'search', 'test',
    'selectedDate', (SELECT date FROM next_thursday)::TEXT,
    'timeSlotStart', '14:00',
    'timeSlotEnd', '17:00'
  )
);

-- Expected: staff_available_count = 1 (Dr. Sara only, Dr. Ahmed not available Thu)

-- ============================================================
-- TEST 8: Compatibility with V1 filters
-- Expected: Should accept all V1 parameters
-- ============================================================

SELECT '=== TEST 8: Backward Compatibility (All V1 Filters) ===' AS test_name;

SELECT 
  id,
  name,
  specialty,
  city,
  average_rating,
  total_ratings,
  staff_available_count,
  CASE 
    WHEN id IS NOT NULL THEN '✅ PASS (V1 filters work)'
    ELSE '❌ FAIL'
  END AS test_result
FROM search_clinics_v2('{
  "search": "test",
  "city": "Casablanca",
  "specialty": "Dentaire",
  "minRating": 0,
  "sortBy": "name",
  "limit": 10,
  "offset": 0
}'::JSONB);

-- ============================================================
-- TEST 9: Performance test (EXPLAIN ANALYZE)
-- ============================================================

SELECT '=== TEST 9: Performance Check ===' AS test_name;

EXPLAIN (ANALYZE, BUFFERS)
SELECT * FROM search_clinics_v2('{
  "search": "test",
  "selectedDate": "2025-10-27",
  "timeSlotStart": "09:00",
  "timeSlotEnd": "12:00"
}'::JSONB);

-- Expected: Execution time < 100ms with proper indexes

-- ============================================================
-- TEST 10: Edge case - No time slot filter (any time)
-- ============================================================

SELECT '=== TEST 10: No Time Slot (Show all available staff) ===' AS test_name;

WITH next_monday AS (
  SELECT (CURRENT_DATE + (8 - EXTRACT(ISODOW FROM CURRENT_DATE))::INTEGER) AS date
)
SELECT 
  id,
  name,
  staff_available_count,
  CASE 
    WHEN staff_available_count = 2 THEN '✅ PASS (Both Dr. Ahmed and Dr. Sara)'
    ELSE '❌ FAIL (Expected 2, got ' || staff_available_count || ')'
  END AS test_result
FROM search_clinics_v2(
  jsonb_build_object(
    'search', 'test',
    'selectedDate', (SELECT date FROM next_monday)::TEXT
    -- No timeSlotStart/End = show all staff available that day
  )
);

-- Expected: staff_available_count = 2

-- ============================================================
-- CLEANUP (Optional - uncomment to remove test data)
-- ============================================================

/*
DELETE FROM resource_availabilities 
WHERE staff_id IN (
  '00000000-0000-0000-0000-000000000011',
  '00000000-0000-0000-0000-000000000012'
);

DELETE FROM clinic_staff 
WHERE id IN (
  '00000000-0000-0000-0000-000000000011',
  '00000000-0000-0000-0000-000000000012'
);

DELETE FROM clinics 
WHERE id = '00000000-0000-0000-0000-000000000001';
*/

-- ============================================================
-- TEST SUMMARY
-- ============================================================

SELECT '=== TEST SUMMARY ===' AS summary;

SELECT 
  'All tests completed. Review results above.' AS message,
  'Expected: 8 PASS tests (1,2,3,4,5,6,7,8,10) + 1 performance check (9)' AS expected;
