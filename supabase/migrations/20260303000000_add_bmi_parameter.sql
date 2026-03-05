-- Migration: Add Body Mass Index (BMI) Parameter
-- LOINC: 39156-5

-- 1. Add Definition
INSERT INTO public.health_parameter_definitions (id, name, category, unit, axis_impact_weights)
VALUES (
    '39156-5', 
    'Body Mass Index (BMI)', 
    'vitals', 
    'kg/m²', 
    '{"heart": 3, "resilience": 2, "strength": 1, "energy": 1, "mind": 1}'::jsonb
)
ON CONFLICT (id) DO UPDATE SET
    axis_impact_weights = EXCLUDED.axis_impact_weights;

-- 2. Add Gender-Specific Ranges
-- Standard WHO ranges: Underweight < 18.5, Normal 18.5-25, Overweight 25-30, Obese > 30
-- Slightly adjusted for the "men and women" request

-- Male BMI Ranges
INSERT INTO public.health_parameter_ranges (parameter_id, gender, min_age, max_age, normal_min, optimal_min, optimal_max, normal_max, critical_max)
VALUES ('39156-5', 'M', 0, 120, 16, 18.5, 25, 30, 35);

-- Female BMI Ranges
INSERT INTO public.health_parameter_ranges (parameter_id, gender, min_age, max_age, normal_min, optimal_min, optimal_max, normal_max, critical_max)
VALUES ('39156-5', 'F', 0, 120, 15, 18, 24, 29, 34);

-- Catch-all for other/unspecified
INSERT INTO public.health_parameter_ranges (parameter_id, gender, min_age, max_age, normal_min, optimal_min, optimal_max, normal_max, critical_max)
VALUES ('39156-5', 'ALL', 0, 120, 16, 18.5, 25, 30, 35);
