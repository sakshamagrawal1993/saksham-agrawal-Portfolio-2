-- P0-14c AC13 — audit query for deterministic edge emergency firings.
-- Tolerates historical rows where raw_result.match is absent (NULL fields).
-- Paste production output into the PR DoD when available.

SELECT
  se.created_at,
  se.consultation_id,
  se.turn_count,
  se.crisis_type,
  se.raw_result -> 'match' ->> 'rule_id' AS rule_id,
  se.raw_result -> 'match' ->> 'pattern_set_version' AS pattern_set_version,
  se.raw_result -> 'match' ->> 'span' AS span,
  se.raw_result -> 'match' ->> 'lane' AS lane
FROM libertymd_safety_events AS se
WHERE se.source = 'edge_deterministic'
ORDER BY se.created_at DESC;

-- P0-14c AC14 — false-positive review grouping (rule × pattern-set version).
-- SELECT
--   se.raw_result -> 'match' ->> 'rule_id' AS rule_id,
--   se.raw_result -> 'match' ->> 'pattern_set_version' AS pattern_set_version,
--   count(*) AS firings
-- FROM libertymd_safety_events AS se
-- WHERE se.source = 'edge_deterministic'
-- GROUP BY 1, 2
-- ORDER BY firings DESC;
