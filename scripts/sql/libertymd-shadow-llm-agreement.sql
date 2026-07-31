-- P0-15a AC5 — LLM agreement rate on edge_deterministic firings with a completed shadow.
-- Historical / NULL shadow_llm tolerated (same spirit as P0-14c AC13).
-- Live production paste is DoD/PR evidence, not a :ci gate (BASELINE).

SELECT
  count(*) FILTER (
    WHERE se.raw_result -> 'shadow_llm' ->> 'outcome' = 'completed'
  ) AS completed_shadows,
  count(*) FILTER (
    WHERE se.raw_result -> 'shadow_llm' ->> 'outcome' = 'completed'
      AND (se.raw_result -> 'shadow_llm' ->> 'force_end')::boolean IS TRUE
  ) AS llm_agreed_force_end,
  count(*) FILTER (
    WHERE se.raw_result -> 'shadow_llm' ->> 'outcome' = 'completed'
      AND (se.raw_result -> 'shadow_llm' ->> 'force_end')::boolean IS NOT TRUE
  ) AS llm_disagreed,
  count(*) FILTER (
    WHERE se.raw_result -> 'shadow_llm' ->> 'outcome' = 'completed'
      AND se.raw_result -> 'shadow_llm' ->> 'crisis_type' = se.crisis_type
  ) AS crisis_type_agreed,
  round(
    100.0 * count(*) FILTER (
      WHERE se.raw_result -> 'shadow_llm' ->> 'outcome' = 'completed'
        AND (se.raw_result -> 'shadow_llm' ->> 'force_end')::boolean IS TRUE
    )
    / nullif(
      count(*) FILTER (
        WHERE se.raw_result -> 'shadow_llm' ->> 'outcome' = 'completed'
      ),
      0
    ),
    1
  ) AS llm_force_end_agreement_pct
FROM libertymd_safety_events AS se
WHERE se.source = 'edge_deterministic'
  AND se.force_end IS TRUE;

-- Sample rows (optional paste):
-- SELECT
--   se.created_at,
--   se.consultation_id,
--   se.crisis_type AS edge_crisis_type,
--   se.raw_result -> 'shadow_llm' ->> 'shadow_llm_status' AS shadow_llm_status,
--   se.raw_result -> 'shadow_llm' ->> 'force_end' AS llm_force_end,
--   se.raw_result -> 'shadow_llm' ->> 'crisis_type' AS llm_crisis_type,
--   se.raw_result -> 'shadow_llm' ->> 'outcome' AS outcome
-- FROM libertymd_safety_events AS se
-- WHERE se.source = 'edge_deterministic'
--   AND se.raw_result ? 'shadow_llm'
-- ORDER BY se.created_at DESC
-- LIMIT 50;
