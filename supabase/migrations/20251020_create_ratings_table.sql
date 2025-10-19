-- Ratings and Reviews Table
CREATE TABLE IF NOT EXISTS public.clinic_ratings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id UUID NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  patient_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Rating data
  rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
  review_text TEXT,
  
  -- Metadata
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Prevent duplicate ratings (one rating per patient per clinic)
  UNIQUE(clinic_id, patient_id)
);

-- Indexes for performance
CREATE INDEX idx_clinic_ratings_clinic_id ON public.clinic_ratings(clinic_id);
CREATE INDEX idx_clinic_ratings_patient_id ON public.clinic_ratings(patient_id);
CREATE INDEX idx_clinic_ratings_created_at ON public.clinic_ratings(created_at DESC);

-- RLS Policies
ALTER TABLE public.clinic_ratings ENABLE ROW LEVEL SECURITY;

-- Anyone can view ratings
CREATE POLICY "Ratings are viewable by everyone"
  ON public.clinic_ratings FOR SELECT
  USING (true);

-- Only authenticated users can insert ratings
CREATE POLICY "Authenticated users can create ratings"
  ON public.clinic_ratings FOR INSERT
  WITH CHECK (auth.uid() = patient_id);

-- Users can update their own ratings
CREATE POLICY "Users can update their own ratings"
  ON public.clinic_ratings FOR UPDATE
  USING (auth.uid() = patient_id)
  WITH CHECK (auth.uid() = patient_id);

-- Users can delete their own ratings
CREATE POLICY "Users can delete their own ratings"
  ON public.clinic_ratings FOR DELETE
  USING (auth.uid() = patient_id);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_clinic_ratings_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_clinic_ratings_timestamp
  BEFORE UPDATE ON public.clinic_ratings
  FOR EACH ROW
  EXECUTE FUNCTION update_clinic_ratings_updated_at();

-- Materialized view for clinic rating stats (for performance)
CREATE MATERIALIZED VIEW public.clinic_rating_stats AS
SELECT 
  clinic_id,
  COUNT(*) as total_ratings,
  AVG(rating)::NUMERIC(3,2) as average_rating,
  COUNT(CASE WHEN rating = 5 THEN 1 END) as five_star_count,
  COUNT(CASE WHEN rating = 4 THEN 1 END) as four_star_count,
  COUNT(CASE WHEN rating = 3 THEN 1 END) as three_star_count,
  COUNT(CASE WHEN rating = 2 THEN 1 END) as two_star_count,
  COUNT(CASE WHEN rating = 1 THEN 1 END) as one_star_count
FROM public.clinic_ratings
GROUP BY clinic_id;

-- Index on materialized view
CREATE UNIQUE INDEX idx_clinic_rating_stats_clinic_id 
  ON public.clinic_rating_stats(clinic_id);

-- Function to refresh rating stats (call after insert/update/delete)
CREATE OR REPLACE FUNCTION refresh_clinic_rating_stats()
RETURNS TRIGGER AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY public.clinic_rating_stats;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-refresh stats
CREATE TRIGGER refresh_rating_stats_after_change
  AFTER INSERT OR UPDATE OR DELETE ON public.clinic_ratings
  FOR EACH STATEMENT
  EXECUTE FUNCTION refresh_clinic_rating_stats();

COMMENT ON TABLE public.clinic_ratings IS 'Patient ratings and reviews for clinics';
COMMENT ON MATERIALIZED VIEW public.clinic_rating_stats IS 'Aggregated rating statistics per clinic (auto-refreshed)';