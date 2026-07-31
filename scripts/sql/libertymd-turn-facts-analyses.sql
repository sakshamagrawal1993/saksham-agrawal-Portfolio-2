-- P1-20 AC5 · four one-query analyses against libertymd_turn_facts
-- Checked-in SQL artifact. Live non-empty results = DoD+ (needs traffic).
-- Safe to run on empty tables (returns empty sets).
--
-- Grain: one row per (consultation_id, turn_index).
-- Stall statuses (Q5A): abandoned / interviewing / high_risk /
--   awaiting_demographics / clinical_review_needed / report_pending_auth.
-- Non-stall: completed / emergency_stopped (excluded from stall query).
-- Optional join to libertymd_landing_sessions on landing_session_id is OK for
-- acquisition cuts — do not re-own P1-19 campaign rates here.

-- ---------------------------------------------------------------------------
-- (a) Per-turn survival — share of consults that reach each turn_index
-- ---------------------------------------------------------------------------
select
  t.turn_index,
  count(distinct t.consultation_id)::bigint as consults_reaching_turn,
  (
    count(distinct t.consultation_id)::float
    / nullif((select count(*) from public.libertymd_consultations), 0)
  ) as survival_rate
from public.libertymd_turn_facts t
group by t.turn_index
order by t.turn_index;

-- ---------------------------------------------------------------------------
-- (b) Stall distribution by awaiting/next target_slot
--     Last turn row per consult; stallable statuses only (Q5A).
-- ---------------------------------------------------------------------------
select
  coalesce(nullif(trim(last_turn.target_slot), ''), 'unknown') as target_slot,
  count(*)::bigint as stalled_consults
from (
  select distinct on (consultation_id)
    consultation_id,
    target_slot,
    status,
    turn_index
  from public.libertymd_turn_facts
  where status in (
    'abandoned',
    'interviewing',
    'high_risk',
    'awaiting_demographics',
    'clinical_review_needed',
    'report_pending_auth'
  )
  order by consultation_id, turn_index desc
) last_turn
group by 1
order by stalled_consults desc, target_slot;

-- ---------------------------------------------------------------------------
-- (c) Guardrail verdicts by turn
-- ---------------------------------------------------------------------------
select
  t.turn_index,
  t.safety_status,
  t.risk_level,
  t.force_end,
  t.crisis_type,
  t.care_setting,
  count(*)::bigint as event_rows
from public.libertymd_turn_facts t
where t.safety_status is not null
group by
  t.turn_index,
  t.safety_status,
  t.risk_level,
  t.force_end,
  t.crisis_type,
  t.care_setting
order by t.turn_index, event_rows desc;

-- ---------------------------------------------------------------------------
-- (d) Confidence / evidence trajectory by turn (patient grain available)
-- ---------------------------------------------------------------------------
select
  t.turn_index,
  t.user_id,
  t.patient_id,
  count(*) filter (where t.run_status is not null)::bigint as diagnosis_rows,
  avg(t.confidence_score) filter (where t.confidence_score is not null) as avg_confidence_score,
  avg(t.evidence_score) filter (where t.evidence_score is not null) as avg_evidence_score,
  avg(t.clinical_evidence_score) as avg_clinical_evidence_score,
  count(*) filter (where t.is_speculative is true)::bigint as speculative_rows,
  count(*) filter (where t.is_speculative is false)::bigint as final_diagnosis_rows
from public.libertymd_turn_facts t
group by t.turn_index, t.user_id, t.patient_id
order by t.turn_index, t.user_id, t.patient_id;
