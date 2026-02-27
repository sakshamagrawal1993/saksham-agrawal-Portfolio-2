-- Add featured boolean to health_twins for public/featured profiles
ALTER TABLE public.health_twins
ADD COLUMN IF NOT EXISTS featured BOOLEAN DEFAULT FALSE;

-- Allow all authenticated users to read featured twins
CREATE POLICY "Anyone can view featured twins"
ON public.health_twins FOR SELECT
USING (featured = true);
