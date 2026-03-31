-- =============================================================================
-- Mind Coach: Journey lifecycle + task dedup hardening
-- =============================================================================

-- 1) Journey lifecycle columns
ALTER TABLE public.mind_coach_journeys
  ADD COLUMN IF NOT EXISTS journey_state TEXT NOT NULL DEFAULT 'active'
  CHECK (journey_state IN ('active', 'completed', 'archived'));

ALTER TABLE public.mind_coach_journeys
  ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;

-- Backfill completed journeys from already-persisted transition results.
UPDATE public.mind_coach_journeys
SET
  journey_state = 'completed',
  completed_at = COALESCE(completed_at, timezone('utc'::text, now()))
WHERE COALESCE(phase_transition_result->>'phase_gate_reason', '') = 'journey_completed'
  AND journey_state = 'active';

CREATE INDEX IF NOT EXISTS idx_mc_journeys_profile_state_created
  ON public.mind_coach_journeys (profile_id, journey_state, created_at DESC);

-- 2) Task semantic key for dedup
ALTER TABLE public.mind_coach_user_tasks
  ADD COLUMN IF NOT EXISTS task_semantic_key TEXT;

UPDATE public.mind_coach_user_tasks
SET task_semantic_key = lower(
  trim(
    COALESCE(task_type, 'general') || ':' ||
    regexp_replace(COALESCE(dynamic_title, task_name, ''), '\s+', ' ', 'g')
  )
)
WHERE task_semantic_key IS NULL;

-- Keep most recent active task per semantic key; expire older duplicates.
WITH ranked_active AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY profile_id, task_semantic_key
      ORDER BY created_at DESC, id DESC
    ) AS rn
  FROM public.mind_coach_user_tasks
  WHERE status = 'active'
    AND task_semantic_key IS NOT NULL
)
UPDATE public.mind_coach_user_tasks t
SET
  status = 'expired',
  updated_at = timezone('utc'::text, now())
FROM ranked_active r
WHERE t.id = r.id
  AND r.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS idx_mc_tasks_active_semantic_unique
  ON public.mind_coach_user_tasks (profile_id, task_semantic_key)
  WHERE status = 'active' AND task_semantic_key IS NOT NULL;
