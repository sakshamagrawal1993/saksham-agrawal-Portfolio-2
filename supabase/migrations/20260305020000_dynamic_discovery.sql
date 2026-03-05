-- Add pathway_confidence column to mind_coach_sessions to track the Dynamic Discovery progress
-- and discovery_state to mind_coach_journeys to hold the final recommended pathway before transition.

ALTER TABLE public.mind_coach_sessions ADD COLUMN IF NOT EXISTS pathway_confidence INT DEFAULT 0;
ALTER TABLE public.mind_coach_journeys ADD COLUMN IF NOT EXISTS discovery_state JSONB DEFAULT '{}'::jsonb;
