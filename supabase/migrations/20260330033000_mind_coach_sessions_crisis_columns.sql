-- Promote crisis tracking to top-level session columns.
ALTER TABLE public.mind_coach_sessions
  ADD COLUMN IF NOT EXISTS crisis_detected BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS crisis_detection_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS crisis_last_detected_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS crisis_last_type TEXT NULL;

-- Backfill from existing summary_data structure, if present.
UPDATE public.mind_coach_sessions
SET
  crisis_detected = CASE
    WHEN COALESCE((summary_data->'crisis_flags'->>'detected')::boolean, false) = true THEN true
    WHEN COALESCE((summary_data->>'crisis_detected')::boolean, false) = true THEN true
    ELSE crisis_detected
  END,
  crisis_detection_count = GREATEST(
    crisis_detection_count,
    COALESCE((summary_data->'crisis_flags'->>'detection_count')::int, 0),
    CASE
      WHEN COALESCE((summary_data->'crisis_flags'->>'detected')::boolean, false) = true THEN 1
      WHEN COALESCE((summary_data->>'crisis_detected')::boolean, false) = true THEN 1
      ELSE 0
    END
  ),
  crisis_last_detected_at = COALESCE(
    crisis_last_detected_at,
    NULLIF(summary_data->'crisis_flags'->>'last_detected_at', '')::timestamptz
  ),
  crisis_last_type = COALESCE(
    crisis_last_type,
    NULLIF(summary_data->'crisis_flags'->>'last_crisis_type', '')
  )
WHERE summary_data IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_mc_sessions_crisis_detected
  ON public.mind_coach_sessions (profile_id, crisis_detected)
  WHERE crisis_detected = true;

COMMENT ON COLUMN public.mind_coach_sessions.crisis_detected IS
  'True when crisis risk has been detected at least once during this session.';
COMMENT ON COLUMN public.mind_coach_sessions.crisis_detection_count IS
  'Number of times crisis risk was detected during this session.';
COMMENT ON COLUMN public.mind_coach_sessions.crisis_last_detected_at IS
  'UTC timestamp for the most recent crisis detection in this session.';
COMMENT ON COLUMN public.mind_coach_sessions.crisis_last_type IS
  'Latest crisis type label returned by screening pipeline.';
