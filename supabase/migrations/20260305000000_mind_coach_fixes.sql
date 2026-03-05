-- =============================================================================
-- Mind Coach Fixes
-- =============================================================================

-- 1. Make profile user_id optional
ALTER TABLE public.mind_coach_profiles ALTER COLUMN user_id DROP NOT NULL;

-- 2. Add missing fields to journeys
ALTER TABLE public.mind_coach_journeys ADD COLUMN current_phase_index INT NOT NULL DEFAULT 0;
ALTER TABLE public.mind_coach_journeys ADD COLUMN sessions_completed INT NOT NULL DEFAULT 0;
ALTER TABLE public.mind_coach_journeys ADD COLUMN active BOOLEAN NOT NULL DEFAULT true;

-- 3. Update memory type checks for long term memory extraction
ALTER TABLE public.mind_coach_memories DROP CONSTRAINT IF EXISTS mind_coach_memories_memory_type_check;
ALTER TABLE public.mind_coach_memories ADD CONSTRAINT mind_coach_memories_memory_type_check CHECK (
    memory_type IN (
        'trigger', 'pattern', 'breakthrough', 'coping_strategy', 
        'life_context', 'preference', 'fact', 'relationship', 'goal'
    )
);
