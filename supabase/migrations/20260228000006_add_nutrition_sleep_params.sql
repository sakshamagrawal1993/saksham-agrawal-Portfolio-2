-- Migration: 20260228000006_add_nutrition_sleep_params.sql
-- Purpose: Ensures all necessary Google Health Connect parameters for Sleep and Nutrition exist in the master definitions table.

INSERT INTO health_parameter_definitions (id, name, category, unit, axis_impact_weights)
VALUES
    -- Nutrition (Meal Group)
    ('Meal Type', 'Meal Type', 'nutrition', 'text', '{"energy": 1}'::jsonb),
    ('Total Fat', 'Total Fat', 'nutrition', 'g', '{"energy": 2, "heart": 1, "hormone": 1}'::jsonb),
    ('Total Carbohydrate', 'Total Carbohydrate', 'nutrition', 'g', '{"energy": 3, "strength": 1, "mind": 1, "hormone": 1}'::jsonb),
    ('Total Protein', 'Total Protein', 'nutrition', 'g', '{"energy": 1, "strength": 3, "resilience": 1}'::jsonb),
    ('Total Energy', 'Total Energy', 'nutrition', 'kcal', '{"energy": 3, "strength": 1, "mind": 1}'::jsonb),
    
    -- Expanded Sleep parameters (Google Health Connect)
    ('Sleep Average Heart Rate', 'Sleep Average Heart Rate', 'sleep', 'bpm', '{"energy": 1, "mind": 1, "resilience": 2, "heart": 3}'::jsonb),
    ('Sleep Average Respiratory Rate', 'Sleep Average Respiratory Rate', 'sleep', 'breaths/min', '{"energy": 1, "mind": 1, "resilience": 2, "heart": 2}'::jsonb),
    ('Sleep Skin Temperature Min', 'Sleep Skin Temperature Min', 'sleep', '°C', '{"energy": 1, "resilience": 1, "hormone": 1, "environment": 1}'::jsonb),
    ('Sleep Skin Temperature Max', 'Sleep Skin Temperature Max', 'sleep', '°C', '{"energy": 1, "resilience": 1, "hormone": 1, "environment": 1}'::jsonb),
    ('Sleep Total Snoring Time', 'Sleep Total Snoring Time', 'sleep', 'min', '{"resilience": 1, "heart": 1}'::jsonb),
    ('Sleep Average SPO2', 'Sleep Average SPO2', 'sleep', '%', '{"energy": 2, "mind": 1, "resilience": 2, "heart": 2}'::jsonb),
    ('Sleep Min SPO2', 'Sleep Min SPO2', 'sleep', '%', '{"energy": 2, "mind": 1, "resilience": 2, "heart": 2}'::jsonb),
    ('Sleep Minutes Low Oxygen', 'Sleep Minutes Low Oxygen', 'sleep', 'min', '{"energy": 1, "mind": 1, "resilience": 2, "heart": 2}'::jsonb)
ON CONFLICT (id) DO NOTHING;
