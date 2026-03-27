-- Structured payloads from chat (exercise_card, games, etc.)
ALTER TABLE public.mind_coach_messages
  ADD COLUMN IF NOT EXISTS dynamic_content JSONB;
