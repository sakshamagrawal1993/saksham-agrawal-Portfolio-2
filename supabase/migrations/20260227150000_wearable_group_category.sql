-- Add group_id, category, and parameter_text to health_wearable_parameters
ALTER TABLE public.health_wearable_parameters
ADD COLUMN IF NOT EXISTS group_id UUID,
ADD COLUMN IF NOT EXISTS category TEXT,
ADD COLUMN IF NOT EXISTS parameter_text TEXT;

-- Index on category for fast filtering
CREATE INDEX IF NOT EXISTS idx_wearable_category ON public.health_wearable_parameters(category);

-- Index on group_id for grouping related parameters
CREATE INDEX IF NOT EXISTS idx_wearable_group_id ON public.health_wearable_parameters(group_id);
