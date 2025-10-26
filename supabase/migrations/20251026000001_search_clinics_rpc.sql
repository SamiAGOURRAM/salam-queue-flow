-- ============================================================
-- SMART CLINIC SEARCH RPC (MVP - Agent Ready)
-- ============================================================
-- This function provides server-side filtering for clinic search
-- Agent-ready: Can be used by UI or AI chatbot with same interface
-- 
-- Usage:
-- SELECT * FROM search_clinics('{"search": "dental", "city": "Casablanca", "sortBy": "rating"}'::JSONB);
-- ============================================================

CREATE OR REPLACE FUNCTION public.search_clinics(
  p_filters JSONB DEFAULT '{}'::JSONB
)
RETURNS TABLE(
  id UUID,
  name TEXT,
  name_ar TEXT,
  specialty TEXT,
  city TEXT,
  address TEXT,
  phone TEXT,
  logo_url TEXT,
  settings JSONB,
  average_rating NUMERIC,
  total_ratings BIGINT,
  is_open_now BOOLEAN,
  today_hours TEXT
) 
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_search TEXT := p_filters->>'search';
  v_city TEXT := p_filters->>'city';
  v_specialty TEXT := p_filters->>'specialty';
  v_min_rating NUMERIC := COALESCE((p_filters->>'minRating')::NUMERIC, 0);
  v_sort_by TEXT := COALESCE(p_filters->>'sortBy', 'name');
  v_limit INT := COALESCE((p_filters->>'limit')::INT, 100);
  v_offset INT := COALESCE((p_filters->>'offset')::INT, 0);
  v_today TEXT;
  v_now TIME;
BEGIN
  -- Get current day of week (lowercase, trimmed)
  v_today := LOWER(TO_CHAR(CURRENT_DATE, 'Day'));
  v_today := TRIM(v_today);
  v_now := CURRENT_TIME;

  RETURN QUERY
  WITH clinic_data AS (
    SELECT 
      c.id,
      c.name,
      c.name_ar,
      c.specialty,
      c.city,
      c.address,
      c.phone,
      c.logo_url,
      c.settings,
      COALESCE(crs.average_rating, 0) as avg_rating,
      COALESCE(crs.total_ratings, 0) as tot_ratings,
      -- Extract today's schedule from JSONB
      c.settings->'working_hours'->v_today as today_schedule
    FROM public.clinics c
    LEFT JOIN public.clinic_rating_stats crs ON c.id = crs.clinic_id
    WHERE 
      c.is_active = true
      -- Search filter (name, specialty, city)
      AND (
        v_search IS NULL 
        OR v_search = ''
        OR LOWER(c.name) LIKE '%' || LOWER(v_search) || '%'
        OR LOWER(c.specialty) LIKE '%' || LOWER(v_search) || '%'
        OR LOWER(c.city) LIKE '%' || LOWER(v_search) || '%'
      )
      -- City filter
      AND (v_city IS NULL OR v_city = 'all' OR c.city = v_city)
      -- Specialty filter
      AND (v_specialty IS NULL OR v_specialty = 'all' OR c.specialty = v_specialty)
      -- Rating filter
      AND (v_min_rating = 0 OR COALESCE(crs.average_rating, 0) >= v_min_rating)
  )
  SELECT 
    cd.id,
    cd.name,
    cd.name_ar,
    cd.specialty,
    cd.city,
    cd.address,
    cd.phone,
    cd.logo_url,
    cd.settings,
    cd.avg_rating,
    cd.tot_ratings,
    -- Compute is_open_now
    CASE 
      WHEN cd.today_schedule IS NULL THEN false
      WHEN (cd.today_schedule->>'closed')::BOOLEAN = true THEN false
      WHEN cd.today_schedule->>'open' IS NULL THEN false
      ELSE v_now BETWEEN (cd.today_schedule->>'open')::TIME 
                     AND (cd.today_schedule->>'close')::TIME
    END as is_open_now,
    -- Format today's hours
    CASE 
      WHEN cd.today_schedule IS NULL THEN 'Closed'
      WHEN (cd.today_schedule->>'closed')::BOOLEAN = true THEN 'Closed'
      WHEN cd.today_schedule->>'open' IS NULL THEN 'Closed'
      ELSE (cd.today_schedule->>'open') || ' - ' || (cd.today_schedule->>'close')
    END as today_hours
  FROM clinic_data cd
  ORDER BY 
    CASE 
      WHEN v_sort_by = 'name' THEN cd.name
      WHEN v_sort_by = 'city' THEN cd.city
      ELSE cd.name
    END ASC,
    CASE 
      WHEN v_sort_by = 'rating' THEN cd.avg_rating
      ELSE 0
    END DESC,
    cd.name ASC
  LIMIT v_limit
  OFFSET v_offset;
END;
$$;

-- Grant access to all users (anon and authenticated)
GRANT EXECUTE ON FUNCTION public.search_clinics(JSONB) TO anon, authenticated;

-- Add helpful comment
COMMENT ON FUNCTION public.search_clinics IS 
'Smart clinic search with server-side filtering. Agent-ready for AI chatbot integration.
Filters: search (text), city, specialty, minRating, sortBy (name|rating|city), limit, offset';
