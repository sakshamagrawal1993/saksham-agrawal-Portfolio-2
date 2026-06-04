-- Migration: Create portfolio_projects table for dynamic overrides
-- Up
CREATE TABLE IF NOT EXISTS public.portfolio_projects (
    id text PRIMARY KEY,
    slide_deck_url text,
    image_url text,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable RLS
ALTER TABLE public.portfolio_projects ENABLE ROW LEVEL SECURITY;

-- Allow public read access
CREATE POLICY "Allow public read access on portfolio_projects" ON public.portfolio_projects
    FOR SELECT
    USING (true);

-- Insert initial project IDs
INSERT INTO public.portfolio_projects (id) VALUES
    ('ai-gate'),
    ('trading-agents'),
    ('fno-copilot'),
    ('insightslm'),
    ('ticketflow'),
    ('runner'),
    ('mind-coach'),
    ('digital-twin'),
    ('dr-jivi'),
    ('jivi-orchestrator'),
    ('p3'),
    ('postpe-cc'),
    ('postpe-pl'),
    ('postpe-emi'),
    ('p5'),
    ('p6'),
    ('p7'),
    ('p8')
ON CONFLICT (id) DO NOTHING;
