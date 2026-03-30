-- =============================================================================
-- Mind Coach Journey Invariant Hardening
-- =============================================================================

-- 1) Normalize duplicate in-progress rows before adding unique invariant.
WITH ranked_in_progress AS (
    SELECT
        id,
        ROW_NUMBER() OVER (
            PARTITION BY journey_id, phase_number
            ORDER BY session_order ASC, attempt_count DESC, created_at ASC
        ) AS rn
    FROM public.mind_coach_journey_sessions
    WHERE status = 'in_progress'
)
UPDATE public.mind_coach_journey_sessions js
SET status = 'planned',
    updated_at = timezone('utc'::text, now())
FROM ranked_in_progress rip
WHERE js.id = rip.id
  AND rip.rn > 1;

-- 2) Ensure exactly one active in-progress row in current phase when possible.
WITH current_phase_targets AS (
    SELECT
        j.id AS journey_id,
        COALESCE(j.current_phase, COALESCE(j.current_phase_index, 0) + 1, 1) AS phase_number
    FROM public.mind_coach_journeys j
    WHERE j.active = true
),
latest_attempts AS (
    SELECT DISTINCT ON (js.journey_id, js.phase_number, js.session_order)
        js.id,
        js.journey_id,
        js.phase_number,
        js.session_order,
        js.status,
        js.attempt_count
    FROM public.mind_coach_journey_sessions js
    JOIN current_phase_targets cpt
      ON cpt.journey_id = js.journey_id
     AND cpt.phase_number = js.phase_number
    ORDER BY js.journey_id, js.phase_number, js.session_order, js.attempt_count DESC, js.created_at DESC
),
candidate_rows AS (
    SELECT
        la.id,
        la.journey_id,
        la.phase_number,
        la.session_order,
        la.status,
        ROW_NUMBER() OVER (
            PARTITION BY la.journey_id, la.phase_number
            ORDER BY la.session_order ASC
        ) AS order_rank
    FROM latest_attempts la
    WHERE la.status <> 'completed'
),
first_candidates AS (
    SELECT id, journey_id, phase_number
    FROM candidate_rows
    WHERE order_rank = 1
)
UPDATE public.mind_coach_journey_sessions js
SET status = 'in_progress',
    activated_at = COALESCE(js.activated_at, timezone('utc'::text, now())),
    updated_at = timezone('utc'::text, now())
FROM first_candidates fc
WHERE js.id = fc.id
  AND js.status = 'planned';

-- 3) De-duplicate evaluations for same journey_session + session pair.
WITH ranked_evals AS (
    SELECT
        id,
        ROW_NUMBER() OVER (
            PARTITION BY journey_session_id, session_id
            ORDER BY created_at DESC, id DESC
        ) AS rn
    FROM public.mind_coach_session_evaluations
    WHERE session_id IS NOT NULL
)
DELETE FROM public.mind_coach_session_evaluations e
USING ranked_evals r
WHERE e.id = r.id
  AND r.rn > 1;

-- 4) Invariants.
CREATE UNIQUE INDEX IF NOT EXISTS idx_mc_journey_sessions_one_in_progress_per_phase
    ON public.mind_coach_journey_sessions (journey_id, phase_number)
    WHERE status = 'in_progress';

CREATE UNIQUE INDEX IF NOT EXISTS idx_mc_session_evals_unique_session_journey_session
    ON public.mind_coach_session_evaluations (journey_session_id, session_id)
    WHERE session_id IS NOT NULL;
