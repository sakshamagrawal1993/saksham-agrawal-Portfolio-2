-- Add ended_at to health_wearable_parameters for range-based measurements (e.g. steps, sleep)
ALTER TABLE public.health_wearable_parameters
ADD COLUMN IF NOT EXISTS ended_at TIMESTAMP WITH TIME ZONE;
