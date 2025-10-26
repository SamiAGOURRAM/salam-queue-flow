-- ============================================================
-- TEST QUERIES FOR search_clinics RPC
-- ============================================================
-- Run these in Supabase SQL Editor to verify the function works
-- ============================================================

-- Test 1: Basic search - no filters (should return all active clinics)
SELECT * FROM public.search_clinics('{}'::JSONB);

-- Test 2: Search by text (name, specialty, or city)
SELECT * FROM public.search_clinics('{"search": "dental"}'::JSONB);

-- Test 3: Filter by city
SELECT * FROM public.search_clinics('{"city": "Casablanca"}'::JSONB);

-- Test 4: Filter by specialty
SELECT * FROM public.search_clinics('{"specialty": "Cardiology"}'::JSONB);

-- Test 5: Filter by minimum rating (4+ stars)
SELECT * FROM public.search_clinics('{"minRating": 4}'::JSONB);

-- Test 6: Sort by rating (highest first)
SELECT name, average_rating, total_ratings 
FROM public.search_clinics('{"sortBy": "rating"}'::JSONB);

-- Test 7: Sort by city
SELECT name, city 
FROM public.search_clinics('{"sortBy": "city"}'::JSONB);

-- Test 8: Combined filters (search + city + rating + sort)
SELECT name, city, specialty, average_rating, is_open_now, today_hours
FROM public.search_clinics('{
  "search": "clinic",
  "city": "Rabat",
  "minRating": 3,
  "sortBy": "rating",
  "limit": 10
}'::JSONB);

-- Test 9: Check "is_open_now" and "today_hours" computation
SELECT name, is_open_now, today_hours 
FROM public.search_clinics('{"limit": 20}'::JSONB);

-- Test 10: Pagination test (offset and limit)
SELECT name FROM public.search_clinics('{"limit": 5, "offset": 0}'::JSONB);
SELECT name FROM public.search_clinics('{"limit": 5, "offset": 5}'::JSONB);

-- ============================================================
-- PERFORMANCE TEST (optional)
-- ============================================================
-- Check execution time for complex query
EXPLAIN ANALYZE
SELECT * FROM public.search_clinics('{
  "search": "clinic",
  "minRating": 3,
  "sortBy": "rating"
}'::JSONB);

-- ============================================================
-- VERIFY INDEXES (optional - check if proper indexes exist)
-- ============================================================
SELECT 
  schemaname,
  tablename,
  indexname,
  indexdef
FROM pg_indexes
WHERE tablename IN ('clinics', 'clinic_rating_stats')
ORDER BY tablename, indexname;
