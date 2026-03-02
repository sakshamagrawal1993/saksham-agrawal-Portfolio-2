-- Migration: seed_playground_definitions.sql
-- Purpose: Seeds the missing ~20 parameters required for the 51-parameter Digital Twin Playground.

-- 1. Insert/Update Parameter Definitions
INSERT INTO public.health_parameter_definitions (id, name, category, unit, axis_impact_weights) VALUES
-- Activity (Expanded)
('floors_climbed', 'Floors Climbed', 'activity', 'floors', '{"energy":2,"strength":2,"heart":1}'::jsonb),

-- Vitals (Expanded)
('hrv', 'Average HRV', 'vitals', 'ms', '{"mind":1,"resilience":3,"heart":2}'::jsonb),
('blood_glucose_max', '7-day Max Blood Glucose', 'vitals', 'mg/dL', '{"energy":3,"heart":1}'::jsonb),
('blood_glucose_min', '7-day Min Blood Glucose', 'vitals', 'mg/dL', '{"energy":3,"heart":1}'::jsonb),

-- Environment
('aqi', 'Air Quality Index', 'environment', 'index', '{"environment":3,"resilience":2}'::jsonb),
('uv_index', 'UV Index', 'environment', 'index', '{"environment":3,"resilience":1}'::jsonb),
('pollen_level', 'Pollen Level', 'environment', 'level', '{"environment":2,"resilience":3}'::jsonb),

-- Nutrition
('water_intake', 'Daily Water Intake', 'nutrition', 'L', '{"energy":1,"resilience":3}'::jsonb),
('protein_pct', 'Protein Percentage', 'nutrition', '%', '{"strength":3}'::jsonb),
('carbs_pct', 'Carbs Percentage', 'nutrition', '%', '{"energy":3,"hormone":1}'::jsonb),
('fats_pct', 'Fats Percentage', 'nutrition', '%', '{"hormone":3,"heart":1}'::jsonb),

-- Stress & Recovery
('stress_level', 'Average Stress Level', 'mental', 'score', '{"mind":3,"hormone":2}'::jsonb),
('recovery_score', 'Recovery Score', 'recovery', 'score', '{"strength":3,"energy":2}'::jsonb),

-- Co-morbidities (Weights act as penalties when TRUE)
('comorb_diabetes', 'Diabetes', 'comorbidity', 'boolean', '{"energy":5,"heart":3,"resilience":2}'::jsonb),
('comorb_hypertension', 'Hypertension', 'comorbidity', 'boolean', '{"heart":5,"resilience":2}'::jsonb),
('comorb_hyperlipidemia', 'Hyperlipidemia', 'comorbidity', 'boolean', '{"heart":5,"resilience":1}'::jsonb),
('comorb_asthma', 'Asthma', 'comorbidity', 'boolean', '{"resilience":5}'::jsonb),
('comorb_sleep_apnea', 'Sleep Apnea', 'comorbidity', 'boolean', '{"mind":2,"heart":3,"resilience":2}'::jsonb),

-- Symptoms
('symp_abdominal_cramps', 'Abdominal Cramps', 'symptom', 'boolean', '{"resilience":3}'::jsonb),
('symp_night_sweats', 'Night Sweats', 'symptom', 'boolean', '{"resilience":3,"hormone":2}'::jsonb)
ON CONFLICT (id) DO UPDATE SET 
    name = EXCLUDED.name,
    category = EXCLUDED.category,
    unit = EXCLUDED.unit,
    axis_impact_weights = EXCLUDED.axis_impact_weights;

-- 2. Insert/Update Parameter Ranges
-- Using 'ALL' gender and 0-120 age for generic playground ranges
INSERT INTO public.health_parameter_ranges (parameter_id, gender, min_age, max_age, normal_min, optimal_min, optimal_max, normal_max, critical_max) VALUES
-- HRV
('hrv', 'ALL', 0, 120, 20, 40, 100, 120, NULL),
-- Glucose Stats
('blood_glucose_max', 'ALL', 0, 120, 70, 70, 140, 180, 250),
('blood_glucose_min', 'ALL', 0, 120, 60, 70, 100, 100, 50),
-- Environment (Lower is better)
('aqi', 'ALL', 0, 120, 0, 0, 50, 100, 300),
('uv_index', 'ALL', 0, 120, 0, 0, 2, 5, 11),
('pollen_level', 'ALL', 0, 120, 0, 0, 3, 6, 12),
-- Nutrition
('water_intake', 'ALL', 0, 120, 2.0, 2.7, 3.7, 5.0, NULL),
('protein_pct', 'ALL', 0, 120, 10, 20, 35, 45, NULL),
('carbs_pct', 'ALL', 0, 120, 30, 45, 60, 70, NULL),
('fats_pct', 'ALL', 0, 120, 15, 20, 35, 45, NULL),
-- Stress (Lower is better)
('stress_level', 'ALL', 0, 120, 0, 0, 25, 60, 90),
-- Recovery (Higher is better)
('recovery_score', 'ALL', 0, 120, 40, 70, 100, 100, NULL),
-- Activity
('floors_climbed', 'ALL', 0, 120, 5, 15, 100, NULL, NULL),

-- Booleans (Optimal = 0 (False), Normal Max = 0, Critical Max = 1 (True))
-- When value is 1 (True), it exceeds Normal Max and targets Critical, lowering the score.
('comorb_diabetes', 'ALL', 0, 120, 0, 0, 0, 0, 1),
('comorb_hypertension', 'ALL', 0, 120, 0, 0, 0, 0, 1),
('comorb_hyperlipidemia', 'ALL', 0, 120, 0, 0, 0, 0, 1),
('comorb_asthma', 'ALL', 0, 120, 0, 0, 0, 0, 1),
('comorb_sleep_apnea', 'ALL', 0, 120, 0, 0, 0, 0, 1),
('symp_abdominal_cramps', 'ALL', 0, 120, 0, 0, 0, 0, 1),
('symp_night_sweats', 'ALL', 0, 120, 0, 0, 0, 0, 1);
