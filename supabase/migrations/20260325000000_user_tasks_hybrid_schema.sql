-- =============================================================================
-- Migration: Hybrid Task Schema — add task_type, dynamic_title, dynamic_description
-- Replaces the generic task_name pattern with structured LLM-friendly columns
-- =============================================================================

-- 1. Add task_type column (the "template category" the LLM picks from)
ALTER TABLE public.mind_coach_user_tasks
    ADD COLUMN IF NOT EXISTS task_type TEXT NOT NULL DEFAULT 'general'
    CHECK (task_type IN ('journaling', 'somatic_exercise', 'cognitive_reframing', 'behavioral_exposure', 'situational_prep', 'general'));

-- 2. Add dynamic_title: personalized, LLM-written task title
ALTER TABLE public.mind_coach_user_tasks
    ADD COLUMN IF NOT EXISTS dynamic_title TEXT;

-- 3. Add dynamic_description: personalized, LLM-written task instructions
ALTER TABLE public.mind_coach_user_tasks
    ADD COLUMN IF NOT EXISTS dynamic_description TEXT;

-- 4. Normalise frequency CHECK constraint to be consistent with new vocabulary
--    (existing values: daily, weekly, as_needed; new: situational, once → add them)
ALTER TABLE public.mind_coach_user_tasks
    DROP CONSTRAINT IF EXISTS mind_coach_user_tasks_task_frequency_check;
ALTER TABLE public.mind_coach_user_tasks
    ADD CONSTRAINT mind_coach_user_tasks_task_frequency_check
    CHECK (task_frequency IN ('daily', 'weekly', 'situational', 'once', 'as_needed'));

-- 5. Backfill existing rows so new NOT NULL-equivalent columns have values
UPDATE public.mind_coach_user_tasks
SET
    dynamic_title       = COALESCE(dynamic_title, task_name),
    dynamic_description = COALESCE(dynamic_description, task_description)
WHERE dynamic_title IS NULL OR dynamic_description IS NULL;
