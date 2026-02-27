-- Drop old tables cleanly
DROP TABLE IF EXISTS public.health_biometrics CASCADE;
DROP TABLE IF EXISTS public.health_recommendations CASCADE;
DROP TABLE IF EXISTS public.health_scores CASCADE;
DROP TABLE IF EXISTS public.health_sources CASCADE;
DROP TABLE IF EXISTS public.health_twins CASCADE;
-- Also drop the type if recreating
DROP TYPE IF EXISTS health_source_status CASCADE;
DROP TYPE IF EXISTS health_source_type CASCADE;

-- 1. Health Twins
CREATE TABLE public.health_twins (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE public.health_twins ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own health twins" 
ON public.health_twins USING (auth.uid() = user_id);

-- 2. Health Scores
CREATE TABLE public.health_scores (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    twin_id UUID REFERENCES public.health_twins(id) ON DELETE CASCADE,
    category TEXT NOT NULL, 
    score NUMERIC NOT NULL CHECK (score >= 0 AND score <= 100),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(twin_id, category)
);

ALTER TABLE public.health_scores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage scores for their twins" 
ON public.health_scores 
USING (EXISTS (SELECT 1 FROM public.health_twins WHERE id = twin_id AND user_id = auth.uid()));

-- 3. Health Summary
CREATE TABLE public.health_summary (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    twin_id UUID REFERENCES public.health_twins(id) ON DELETE CASCADE UNIQUE,
    summary_text TEXT NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE public.health_summary ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage summary for their twins" 
ON public.health_summary 
USING (EXISTS (SELECT 1 FROM public.health_twins WHERE id = twin_id AND user_id = auth.uid()));

-- 4. Health Sources
CREATE TYPE health_source_status AS ENUM ('processing', 'completed', 'failed');
CREATE TYPE health_source_type AS ENUM ('lab_report', 'wearable', 'manual');

CREATE TABLE public.health_sources (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    twin_id UUID REFERENCES public.health_twins(id) ON DELETE CASCADE,
    source_type health_source_type NOT NULL,
    source_name TEXT,
    file_url TEXT,
    status health_source_status DEFAULT 'completed',
    processing_error TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE public.health_sources ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage sources for their twins" 
ON public.health_sources 
USING (EXISTS (SELECT 1 FROM public.health_twins WHERE id = twin_id AND user_id = auth.uid()));

-- 5. Health Recommendations
CREATE TABLE public.health_recommendations (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    twin_id UUID REFERENCES public.health_twins(id) ON DELETE CASCADE,
    activity_name TEXT NOT NULL,
    description TEXT,
    category TEXT,
    status TEXT DEFAULT 'pending',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE public.health_recommendations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage recommendations for their twins" 
ON public.health_recommendations 
USING (EXISTS (SELECT 1 FROM public.health_twins WHERE id = twin_id AND user_id = auth.uid()));

-- 6.1 Health Personal Details
CREATE TABLE public.health_personal_details (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    twin_id UUID REFERENCES public.health_twins(id) ON DELETE CASCADE UNIQUE,
    name TEXT NOT NULL,
    age INTEGER,
    gender TEXT,
    blood_type TEXT,
    height_cm NUMERIC,
    weight_kg NUMERIC,
    co_morbidities TEXT[],
    location TEXT,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE public.health_personal_details ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage personal details for their twins" 
ON public.health_personal_details 
USING (EXISTS (SELECT 1 FROM public.health_twins WHERE id = twin_id AND user_id = auth.uid()));

-- 6.2 Health Lab Parameters
CREATE TABLE public.health_lab_parameters (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    twin_id UUID REFERENCES public.health_twins(id) ON DELETE CASCADE,
    source_id UUID REFERENCES public.health_sources(id) ON DELETE CASCADE,
    parameter_name TEXT NOT NULL,
    parameter_value NUMERIC NOT NULL,
    unit TEXT,
    recorded_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE public.health_lab_parameters ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage lab parameters for their twins" 
ON public.health_lab_parameters 
USING (EXISTS (SELECT 1 FROM public.health_twins WHERE id = twin_id AND user_id = auth.uid()));

-- 6.3 Health Wearable Parameters
CREATE TABLE public.health_wearable_parameters (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    twin_id UUID REFERENCES public.health_twins(id) ON DELETE CASCADE,
    source_id UUID REFERENCES public.health_sources(id) ON DELETE CASCADE,
    parameter_name TEXT NOT NULL,
    parameter_value NUMERIC NOT NULL,
    unit TEXT,
    recorded_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE public.health_wearable_parameters ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage wearable parameters for their twins" 
ON public.health_wearable_parameters 
USING (EXISTS (SELECT 1 FROM public.health_twins WHERE id = twin_id AND user_id = auth.uid()));
