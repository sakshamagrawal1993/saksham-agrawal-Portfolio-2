-- Add name and description to health_twins table
ALTER TABLE public.health_twins 
ADD COLUMN IF NOT EXISTS name TEXT NOT NULL DEFAULT 'My Digital Twin',
ADD COLUMN IF NOT EXISTS description TEXT,
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();
