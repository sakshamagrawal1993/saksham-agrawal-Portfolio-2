-- Create health_twins table
CREATE TABLE IF NOT EXISTS public.health_twins (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    age INTEGER,
    gender TEXT,
    blood_type TEXT,
    height_cm NUMERIC,
    weight_kg NUMERIC,
    co_morbidities TEXT[],
    location TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS for health_twins
ALTER TABLE public.health_twins ENABLE ROW LEVEL SECURITY;

-- Policies for health_twins
CREATE POLICY "Users can view their own health twins" 
ON public.health_twins FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own health twins" 
ON public.health_twins FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own health twins" 
ON public.health_twins FOR UPDATE 
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own health twins" 
ON public.health_twins FOR DELETE 
USING (auth.uid() = user_id);

-- Create health_sources table
CREATE TYPE health_source_status AS ENUM ('processing', 'completed', 'failed');
CREATE TYPE health_source_type AS ENUM ('lab_report', 'wearable', 'manual');

CREATE TABLE IF NOT EXISTS public.health_sources (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    twin_id UUID REFERENCES public.health_twins(id) ON DELETE CASCADE,
    source_type health_source_type NOT NULL,
    source_name TEXT,
    file_url TEXT,
    status health_source_status DEFAULT 'completed',
    processing_error TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS for health_sources
ALTER TABLE public.health_sources ENABLE ROW LEVEL SECURITY;

-- Policy helper view/function not strictly needed, we can join on health_twins, 
-- but a simpler approach for RLS is checking existence in health_twins:
CREATE POLICY "Users can view sources for their twins" 
ON public.health_sources FOR SELECT 
USING (
    EXISTS (
        SELECT 1 FROM public.health_twins 
        WHERE id = public.health_sources.twin_id 
        AND user_id = auth.uid()
    )
);

CREATE POLICY "Users can insert sources for their twins" 
ON public.health_sources FOR INSERT 
WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.health_twins 
        WHERE id = twin_id 
        AND user_id = auth.uid()
    )
);

CREATE POLICY "Users can update sources for their twins" 
ON public.health_sources FOR UPDATE 
USING (
    EXISTS (
        SELECT 1 FROM public.health_twins 
        WHERE id = twin_id 
        AND user_id = auth.uid()
    )
);

CREATE POLICY "Users can delete sources for their twins" 
ON public.health_sources FOR DELETE 
USING (
    EXISTS (
        SELECT 1 FROM public.health_twins 
        WHERE id = twin_id 
        AND user_id = auth.uid()
    )
);

-- Create health_biometrics table
CREATE TABLE IF NOT EXISTS public.health_biometrics (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    twin_id UUID REFERENCES public.health_twins(id) ON DELETE CASCADE,
    source_id UUID REFERENCES public.health_sources(id) ON DELETE CASCADE,
    parameter_name TEXT NOT NULL,
    parameter_value NUMERIC NOT NULL,
    unit TEXT,
    recorded_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS for health_biometrics
ALTER TABLE public.health_biometrics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view biometrics for their twins" 
ON public.health_biometrics FOR SELECT 
USING (
    EXISTS (
        SELECT 1 FROM public.health_twins 
        WHERE id = public.health_biometrics.twin_id 
        AND user_id = auth.uid()
    )
);

CREATE POLICY "Users can insert biometrics for their twins" 
ON public.health_biometrics FOR INSERT 
WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.health_twins 
        WHERE id = twin_id 
        AND user_id = auth.uid()
    )
);

CREATE POLICY "Users can update biometrics for their twins" 
ON public.health_biometrics FOR UPDATE 
USING (
    EXISTS (
        SELECT 1 FROM public.health_twins 
        WHERE id = twin_id 
        AND user_id = auth.uid()
    )
);

CREATE POLICY "Users can delete biometrics for their twins" 
ON public.health_biometrics FOR DELETE 
USING (
    EXISTS (
        SELECT 1 FROM public.health_twins 
        WHERE id = twin_id 
        AND user_id = auth.uid()
    )
);

-- Create health_scores table
CREATE TABLE IF NOT EXISTS public.health_scores (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    twin_id UUID REFERENCES public.health_twins(id) ON DELETE CASCADE,
    category TEXT NOT NULL, 
    score NUMERIC NOT NULL CHECK (score >= 0 AND score <= 100),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(twin_id, category)
);

-- Enable RLS for health_scores
ALTER TABLE public.health_scores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view scores for their twins" 
ON public.health_scores FOR SELECT 
USING (
    EXISTS (
        SELECT 1 FROM public.health_twins 
        WHERE id = public.health_scores.twin_id 
        AND user_id = auth.uid()
    )
);

CREATE POLICY "Users can insert scores for their twins" 
ON public.health_scores FOR INSERT 
WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.health_twins 
        WHERE id = twin_id 
        AND user_id = auth.uid()
    )
);

CREATE POLICY "Users can update scores for their twins" 
ON public.health_scores FOR UPDATE 
USING (
    EXISTS (
        SELECT 1 FROM public.health_twins 
        WHERE id = twin_id 
        AND user_id = auth.uid()
    )
);

-- Create health_recommendations table
CREATE TABLE IF NOT EXISTS public.health_recommendations (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    twin_id UUID REFERENCES public.health_twins(id) ON DELETE CASCADE,
    activity_name TEXT NOT NULL,
    description TEXT,
    category TEXT,
    status TEXT DEFAULT 'pending', -- pending, completed, skipped
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS for health_recommendations
ALTER TABLE public.health_recommendations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view recommendations for their twins" 
ON public.health_recommendations FOR SELECT 
USING (
    EXISTS (
        SELECT 1 FROM public.health_twins 
        WHERE id = public.health_recommendations.twin_id 
        AND user_id = auth.uid()
    )
);

CREATE POLICY "Users can insert recommendations for their twins" 
ON public.health_recommendations FOR INSERT 
WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.health_twins 
        WHERE id = twin_id 
        AND user_id = auth.uid()
    )
);

CREATE POLICY "Users can update recommendations for their twins" 
ON public.health_recommendations FOR UPDATE 
USING (
    EXISTS (
        SELECT 1 FROM public.health_twins 
        WHERE id = twin_id 
        AND user_id = auth.uid()
    )
);

CREATE POLICY "Users can delete recommendations for their twins" 
ON public.health_recommendations FOR DELETE 
USING (
    EXISTS (
        SELECT 1 FROM public.health_twins 
        WHERE id = twin_id 
        AND user_id = auth.uid()
    )
);

