-- Migration: 20260228000007_update_lab_categories.sql
-- Purpose: Consolidates the category of all lab report parameters to 'Lab Report Parameter' as requested.

-- Update lab parameter categories
UPDATE public.health_parameter_definitions
SET category = 'Lab Report Parameter'
WHERE category NOT LIKE 'Wearable - %'
  AND category NOT IN ('nutrition', 'sleep', 'exercise', 'vitals', 'symptoms', 'recovery', 'reproductive', 'activity');

-- There may be some wearable params that don't have the 'Wearable - ' prefix from recent inserts
-- Ensure they are clearly wearable if they match the core 8 categories (but wait, we only need to touch lab params)
-- The above WHERE handles this gracefully.
