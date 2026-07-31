-- P1-20 · libertymd_turn_facts (PHI-safe turn-grain ops view)
--
-- Locks (03-clarified.md):
--   Q1B  series spine turn_index = 1..GREATEST(turn_count,1); LEFT JOIN safety/dx;
--        messages for awaiting/next target_slot only (assistant stamp).
--   Q2A  DISTINCT ON: safety latest created_at; diagnosis prefer non-speculative.
--   Q3A  REVOKE ALL from anon/authenticated/public — no client SELECT.
--   Q4   plain VIEW (no matview / no refresh cron).
--   Q5A  target_slot = awaiting/next; max-turn coalesce to consult target_slot
--        for stallable statuses; emergency_stopped / completed = non-stall.
--   Q6A  no P1-21 stub columns — real scalars only.
--   Q7A  strict allow-list (see COMMENT); omit missing_slots.
--   Q8A  index safety_events (consultation_id, turn_count, created_at DESC).
--
-- Consumers: ops SQL / service_role only. P1-21 may CREATE OR REPLACE later.
-- Complementary (not a substitute): libertymd_product_events turn_* rows.

-- Q8A · support DISTINCT ON / join on turn_count for safety_events
create index if not exists libertymd_safety_events_consultation_turn_created_idx
  on public.libertymd_safety_events (consultation_id, turn_count, created_at desc);

create or replace view public.libertymd_turn_facts as
with turn_spine as (
  select
    c.id as consultation_id,
    c.user_id,
    c.patient_id,
    c.landing_session_id,
    c.status,
    c.target_slot as consult_target_slot,
    c.clinical_evidence_score,
    c.turn_count as consult_turn_count,
    c.created_at as consultation_created_at,
    c.last_activity_at,
    c.updated_at as consultation_updated_at,
    gs.turn_index
  from public.libertymd_consultations c
  cross join lateral generate_series(1, greatest(c.turn_count, 1)) as gs(turn_index)
),
safety_dedup as (
  select distinct on (consultation_id, turn_count)
    consultation_id,
    turn_count,
    status as safety_status,
    risk_level,
    force_end,
    source as safety_source,
    crisis_type,
    care_setting,
    created_at as safety_created_at
  from public.libertymd_safety_events
  order by consultation_id, turn_count, created_at desc
),
diagnosis_dedup as (
  select distinct on (consultation_id, turn_count)
    consultation_id,
    turn_count,
    run_status,
    confidence_score,
    evidence_score,
    is_speculative,
    created_at as diagnosis_created_at
  from public.libertymd_diagnostic_runs
  order by consultation_id, turn_count, is_speculative asc, created_at desc
),
-- Assistant messages with a non-null target_slot stamp the awaiting/next ask.
-- Rank by sequence → turn_index so AC1 can LEFT JOIN messages without content.
assistant_slots as (
  select
    consultation_id,
    target_slot as message_target_slot,
    row_number() over (
      partition by consultation_id
      order by sequence asc
    ) as turn_index
  from public.libertymd_messages
  where role = 'assistant'
    and target_slot is not null
)
select
  t.consultation_id,
  t.user_id,
  t.patient_id,
  t.landing_session_id,
  t.status,
  t.turn_index,
  case
    when t.turn_index = greatest(t.consult_turn_count, 1)
      and t.status in (
        'abandoned',
        'interviewing',
        'high_risk',
        'awaiting_demographics',
        'clinical_review_needed',
        'report_pending_auth'
      )
    then coalesce(a.message_target_slot, t.consult_target_slot)
    else a.message_target_slot
  end as target_slot,
  s.safety_status,
  s.risk_level,
  s.force_end,
  s.safety_source,
  s.crisis_type,
  s.care_setting,
  d.run_status,
  d.confidence_score,
  d.evidence_score,
  d.is_speculative,
  t.clinical_evidence_score,
  t.consultation_created_at,
  t.last_activity_at,
  t.consultation_updated_at,
  s.safety_created_at,
  d.diagnosis_created_at
from turn_spine t
left join safety_dedup s
  on s.consultation_id = t.consultation_id
 and s.turn_count = t.turn_index
left join diagnosis_dedup d
  on d.consultation_id = t.consultation_id
 and d.turn_count = t.turn_index
left join assistant_slots a
  on a.consultation_id = t.consultation_id
 and a.turn_index = t.turn_index;

comment on view public.libertymd_turn_facts is
  'P1-20 PHI-safe turn-grain fact view. Spine: generate_series(1, GREATEST(consultations.turn_count,1)) as turn_index. LEFT JOIN safety_events + diagnostic_runs on (consultation_id, turn_count=turn_index) with DISTINCT ON dedup (safety: created_at DESC; diagnosis: is_speculative ASC then created_at DESC). Messages: assistant target_slot only (awaiting/next); max-turn coalesce to consultations.target_slot for stallable statuses. Allow-list: consultation_id, user_id, patient_id, landing_session_id, status, turn_index, target_slot, safety_status, risk_level, force_end, safety_source, crisis_type, care_setting, run_status, confidence_score, evidence_score, is_speculative, clinical_evidence_score, timestamps. Ban: content, slot_updates, filled_slots, missing_slots, chief_complaint, safety message/red_flags/raw_result, diagnosis JSONB blobs, options, metadata, validation_reason, patient_snapshot, safety_state, intermediate_diagnoses, report bodies, emails, names. Consumers: ops/service_role only — REVOKE ALL from anon/authenticated/public. No P1-21 stubs. P1-21 may CREATE OR REPLACE. Complementary to product_events turn_* — not a substitute.';

-- Q3A · no client SELECT (mirror P1-19 landing posture)
revoke all on table public.libertymd_turn_facts from anon, authenticated;
revoke all on table public.libertymd_turn_facts from public;
