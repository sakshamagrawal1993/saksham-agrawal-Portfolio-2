-- Migration: Health Score Engine Architecture
-- Creates tables for centralized parameter definitions and demographic-based reference ranges.

-- 1. Table: health_parameter_definitions
-- Defines the core lab parameters and how they impact the 7 health axes.
CREATE TABLE IF NOT EXISTS public.health_parameter_definitions (
    id TEXT PRIMARY KEY, -- e.g., 'Albumin SerPl-mCnc' (SHORTNAME) or LOINC code
    name TEXT NOT NULL, -- e.g., 'Albumin, Serum'
    category TEXT, -- e.g., 'Liver', 'Kidney', 'Metabolic'
    unit TEXT, -- e.g., 'g/dL', 'mg/dL'
    -- JSONB object mapping axes to impact weights (0 to 3)
    -- Keys: energy, strength, mind, resilience, heart, hormone, environment
    axis_impact_weights JSONB NOT NULL DEFAULT '{"energy": 0, "strength": 0, "mind": 0, "resilience": 0, "heart": 0, "hormone": 0, "environment": 0}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Protect with RLS (Read-only for users, managed by secure backend)
ALTER TABLE public.health_parameter_definitions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read parameter definitions" 
    ON public.health_parameter_definitions FOR SELECT 
    USING (true);

-- 2. Table: health_parameter_ranges
-- Defines the age and gender specific optimal/normal/critical thresholds for each parameter.
CREATE TYPE demographic_gender AS ENUM ('M', 'F', 'ALL');

-- Ensure pgcrypto is enabled for uuid generation
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS public.health_parameter_ranges (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    parameter_id TEXT NOT NULL REFERENCES public.health_parameter_definitions(id) ON DELETE CASCADE,
    gender demographic_gender NOT NULL DEFAULT 'ALL',
    min_age INTEGER NOT NULL DEFAULT 0,
    max_age INTEGER NOT NULL DEFAULT 120,
    -- Thresholds for the parameter. For "lower is better", critical_min may be NULL, normal_max is the threshold.
    critical_min NUMERIC,
    normal_min NUMERIC,
    optimal_min NUMERIC,
    optimal_max NUMERIC,
    normal_max NUMERIC,
    critical_max NUMERIC,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Index for fast demographic lookups
CREATE INDEX idx_health_ranges_lookup ON public.health_parameter_ranges (parameter_id, gender, min_age, max_age);

-- Protect with RLS
ALTER TABLE public.health_parameter_ranges ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read parameter ranges" 
    ON public.health_parameter_ranges FOR SELECT 
    USING (true);

-- 3. Seed some initial definitions based on the 200 parameters list
-- We will insert a few core ones to test the architecture. A full seed script should handle the rest.

INSERT INTO public.health_parameter_definitions (id, name, category, unit, axis_impact_weights) VALUES
-- Energy & Metabolism
('HbA1c Bld-mCnc', 'Glycated Hemoglobin (HbA1c)', 'Metabolic', '%', '{"energy": 3, "heart": 2, "resilience": 1, "mind": 0, "strength": 0, "hormone": 0, "environment": 0}'::jsonb),
('Glucose p fast BldV-mCnc', 'Fasting Blood Sugar', 'Metabolic', 'mg/dL', '{"energy": 2, "heart": 1, "resilience": 1, "mind": 0, "strength": 0, "hormone": 0, "environment": 0}'::jsonb),
-- Heart & Circulation
('LDLc SerPl Calc-mCnc', 'LDL Cholesterol Cal', 'Lipid', 'mg/dL', '{"heart": 3, "resilience": 1, "energy": 0, "mind": 0, "strength": 0, "hormone": 0, "environment": 0}'::jsonb),
('Trigl SerPl-mCnc', 'Triglycerides, Serum', 'Lipid', 'mg/dL', '{"heart": 2, "energy": 2, "resilience": 1, "mind": 0, "strength": 0, "hormone": 0, "environment": 0}'::jsonb),
-- Resilience & Defence
('CRP SerPl HS-mCnc', 'High Sensitivity C-reactive Protein (Hs-crp)', 'Inflammatory', 'mg/L', '{"resilience": 3, "heart": 2, "strength": 1, "mind": 1, "energy": 0, "hormone": 0, "environment": 0}'::jsonb),
('AST SerPl-cCnc', 'SGOT/AST', 'Liver', 'U/L', '{"resilience": 2, "energy": 1, "strength": 0, "mind": 0, "heart": 0, "hormone": 0, "environment": 0}'::jsonb),
('ALT SerPl-cCnc', 'SGPT/ALT', 'Liver', 'U/L', '{"resilience": 2, "energy": 1, "strength": 0, "mind": 0, "heart": 0, "hormone": 0, "environment": 0}'::jsonb),
-- Hormone & Vitality
('Testost SerPl-mCnc', 'Testosterone', 'Hormone', 'ng/dL', '{"hormone": 3, "strength": 2, "energy": 1, "mind": 1, "resilience": 0, "heart": 0, "environment": 0}'::jsonb),
('Cortis SerPl-mCnc', 'Cortisol', 'Hormone', 'mcg/dL', '{"hormone": 2, "mind": 2, "resilience": 1, "energy": 1, "strength": 0, "heart": 0, "environment": 0}'::jsonb),
('TSH SerPl-aCnc', 'TSH Ultra - Sensitive', 'Thyroid', 'uIU/mL', '{"hormone": 3, "energy": 2, "mind": 1, "strength": 0, "resilience": 0, "heart": 0, "environment": 0}'::jsonb)
ON CONFLICT (id) DO NOTHING;

-- Seed example ranges for Adults (Age 18-120) for demonstration
-- HbA1c: Optimal < 5.4, Normal < 5.7, Critical > 6.5
INSERT INTO public.health_parameter_ranges (parameter_id, gender, min_age, max_age, normal_min, optimal_min, optimal_max, normal_max, critical_max) VALUES
('HbA1c Bld-mCnc', 'ALL', 18, 120, NULL, 4.0, 5.4, 5.7, 6.5),

-- Fasting Glucose: Optimal 70-85, Normal 70-99, Critical > 125
('Glucose p fast BldV-mCnc', 'ALL', 18, 120, 70, 70, 85, 99, 125),

-- LDL Calc: Optimal < 100, Normal < 130, Critical > 160
('LDLc SerPl Calc-mCnc', 'ALL', 18, 120, NULL, 0, 100, 130, 160),

-- hs-CRP: Optimal < 1.0, Normal < 3.0, Critical > 10.0
('CRP SerPl HS-mCnc', 'ALL', 18, 120, NULL, 0, 1.0, 3.0, 10.0),

-- Testosterone Ranges are Gender Specific
-- Male Adult: Optimal 600-900, Normal 300-1000, Critical < 250
('Testost SerPl-mCnc', 'M', 18, 120, 300, 600, 900, 1000, NULL),
-- Female Adult: Optimal 40-70, Normal 15-70, Critical < 10
('Testost SerPl-mCnc', 'F', 18, 120, 15, 30, 60, 70, NULL)
ON CONFLICT DO NOTHING;
