-- Migration: 20260301_wellness_programs.sql
-- Description: Create table for AI-generated personalized wellness programs with 7-day cache TTL

CREATE TABLE IF NOT EXISTS public.health_wellness_programs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    twin_id UUID NOT NULL REFERENCES public.health_twins(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    icon TEXT DEFAULT 'heart',
    priority TEXT DEFAULT 'medium' CHECK (priority IN ('high', 'medium', 'low')),
    duration TEXT,
    reason TEXT NOT NULL,
    data_connections JSONB DEFAULT '[]'::jsonb,
    weekly_plan JSONB DEFAULT '[]'::jsonb,
    expected_outcomes TEXT[] DEFAULT '{}',
    generated_at TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '7 days'),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.health_wellness_programs ENABLE ROW LEVEL SECURITY;

-- RLS policies
DROP POLICY IF EXISTS "Users can view their twin's programs" ON public.health_wellness_programs;
CREATE POLICY "Users can view their twin's programs"
    ON public.health_wellness_programs FOR SELECT
    USING (EXISTS (SELECT 1 FROM public.health_twins WHERE id = twin_id AND user_id = auth.uid()));

DROP POLICY IF EXISTS "Service role full access" ON public.health_wellness_programs;
CREATE POLICY "Service role full access"
    ON public.health_wellness_programs FOR ALL
    USING (true) WITH CHECK (true);

-- Grant SELECT to the readonly role for n8n
GRANT SELECT ON public.health_wellness_programs TO n8n_readonly;
