-- Patient Favorites/Wishlist Table
CREATE TABLE IF NOT EXISTS public.patient_favorites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  clinic_id UUID NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  
  -- Metadata
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Prevent duplicate favorites
  UNIQUE(patient_id, clinic_id)
);

-- Indexes for performance
CREATE INDEX idx_patient_favorites_patient_id ON public.patient_favorites(patient_id);
CREATE INDEX idx_patient_favorites_clinic_id ON public.patient_favorites(clinic_id);
CREATE INDEX idx_patient_favorites_created_at ON public.patient_favorites(created_at DESC);

-- RLS Policies
ALTER TABLE public.patient_favorites ENABLE ROW LEVEL SECURITY;

-- Users can only see their own favorites
CREATE POLICY "Users can view their own favorites"
  ON public.patient_favorites FOR SELECT
  USING (auth.uid() = patient_id);

-- Users can add favorites
CREATE POLICY "Users can add favorites"
  ON public.patient_favorites FOR INSERT
  WITH CHECK (auth.uid() = patient_id);

-- Users can remove their own favorites
CREATE POLICY "Users can delete their own favorites"
  ON public.patient_favorites FOR DELETE
  USING (auth.uid() = patient_id);

-- Materialized view for clinic favorite counts (public stats)
CREATE MATERIALIZED VIEW public.clinic_favorite_stats AS
SELECT 
  clinic_id,
  COUNT(*) as total_favorites
FROM public.patient_favorites
GROUP BY clinic_id;

-- Index on materialized view
CREATE UNIQUE INDEX idx_clinic_favorite_stats_clinic_id 
  ON public.clinic_favorite_stats(clinic_id);

-- Function to refresh favorite stats
CREATE OR REPLACE FUNCTION refresh_clinic_favorite_stats()
RETURNS TRIGGER AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY public.clinic_favorite_stats;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-refresh stats
CREATE TRIGGER refresh_favorite_stats_after_change
  AFTER INSERT OR DELETE ON public.patient_favorites
  FOR EACH STATEMENT
  EXECUTE FUNCTION refresh_clinic_favorite_stats();

COMMENT ON TABLE public.patient_favorites IS 'Patient wishlist/favorites for clinics';
COMMENT ON MATERIALIZED VIEW public.clinic_favorite_stats IS 'Count of favorites per clinic (auto-refreshed)';