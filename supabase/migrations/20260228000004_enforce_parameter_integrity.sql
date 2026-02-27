-- Migration: Enforce Parameter Integrity
-- First, deduplicate health_parameter_definitions by taking the first ID for any duplicate names
WITH duplicates AS (
    SELECT name, MIN(id) as keep_id
    FROM public.health_parameter_definitions
    GROUP BY name
    HAVING COUNT(*) > 1
)
DELETE FROM public.health_parameter_definitions h
USING duplicates d
WHERE h.name = d.name AND h.id != d.keep_id;

-- Second, ensure any parameter strings in lab or wearables that don't match the new definitions 
-- are mapped to a single fallback identifier so the Foreign Key doesn't instantly violently crash the database.
-- (Only doing this for non-matching ones)

-- 1. Ensure the referenced column (name) in definitions is unique so it can be used as a foreign key if needed
ALTER TABLE public.health_parameter_definitions
ADD CONSTRAINT health_parameter_definitions_name_key UNIQUE (name);

-- 3. Add Foreign Key to health_lab_parameters
-- First, handle orphaned lab parameters:
UPDATE public.health_lab_parameters p
SET parameter_name = 'Custom Metric'
WHERE NOT EXISTS (
    SELECT 1 FROM public.health_parameter_definitions d WHERE d.name = p.parameter_name
);

-- Ensure there is a generic custom metric handler
INSERT INTO public.health_parameter_definitions (id, name, category, unit, axis_impact_weights) 
VALUES ('custom-metric', 'Custom Metric', 'Other', 'count', '{"energy": 0, "strength": 0, "mind": 0, "resilience": 1, "heart": 0, "hormone": 0, "environment": 0}'::jsonb)
ON CONFLICT DO NOTHING;

ALTER TABLE public.health_lab_parameters
ADD CONSTRAINT fk_lab_parameter_name
FOREIGN KEY (parameter_name) REFERENCES public.health_parameter_definitions(name)
ON DELETE RESTRICT
ON UPDATE CASCADE;

-- 4. Add Foreign Key to health_wearable_parameters
-- First, handle orphaned wearable parameters:
UPDATE public.health_wearable_parameters p
SET parameter_name = 'Custom Metric'
WHERE NOT EXISTS (
    SELECT 1 FROM public.health_parameter_definitions d WHERE d.name = p.parameter_name
);

ALTER TABLE public.health_wearable_parameters
ADD CONSTRAINT fk_wearable_parameter_name
FOREIGN KEY (parameter_name) REFERENCES public.health_parameter_definitions(name)
ON DELETE RESTRICT
ON UPDATE CASCADE;
