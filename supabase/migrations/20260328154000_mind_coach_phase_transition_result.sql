-- Persist phase progression decision details for auditability and UI messaging.
ALTER TABLE public.mind_coach_journeys
ADD COLUMN IF NOT EXISTS phase_transition_result JSONB;
