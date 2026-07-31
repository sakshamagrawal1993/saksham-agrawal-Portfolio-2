-- P1-21 · Generated STORED columns for hot JSONB scalars
--
-- Locks (03-clarified.md):
--   Q1A  reports.triage_tier — raw nested triage.care_setting → top-level care_setting;
--        only when jsonb_typeof = string; else NULL. No UI display mapping.
--   Q2A  diagnostic_runs.top_dx_confidence — null-safe percent parse from
--        differential_diagnosis -> 0 preferring confidence then confidence_score
--        (mirror parseConfidence digit extract, clamp 0–100); empty/bad → NULL.
--        Keep real confidence_score (may disagree when write-path trusted raw.confidence_score).
--   Q3A  consultations.filled_slot_count — count of 6 CORE_SLOTS with non-null /
--        non-empty-string / non-empty-array values (≈ calculateMissingSlots complement).
--        No uncertain-phrase hasValue in SQL.
--   Q4A  STORED (PG17-forced).
--   Q5   Hybrid indexes: partial triage_tier; plain filled_slot_count; partial top_dx_confidence.
--   Q6B  turn_facts REPLACE — project filled_slot_count + top_dx_confidence; no reports join;
--        keep confidence_score; expand COMMENT allow-list; re-REVOKE.
--   Q7A  Single migration rewrite OK at pilot scale.
--   Q8A  Three columns only.
--
-- JSONB remains SoT. Generated columns are never written as independent inputs.

-- ---------------------------------------------------------------------------
-- Q1A · libertymd_reports.triage_tier (text)
-- ---------------------------------------------------------------------------
alter table public.libertymd_reports
  add column if not exists triage_tier text
  generated always as (
    case
      when jsonb_typeof(report_data #> '{triage,care_setting}') = 'string'
        then nullif(btrim(report_data #>> '{triage,care_setting}'), '')
      when jsonb_typeof(report_data -> 'care_setting') = 'string'
        then nullif(btrim(report_data ->> 'care_setting'), '')
      else null
    end
  ) stored;

comment on column public.libertymd_reports.triage_tier is
  'P1-21 STORED generated. Raw care_setting string from report_data #>> {triage,care_setting} (preferred) else top-level care_setting; only when jsonb_typeof is string; else NULL. JSONB report_data remains SoT — never write this column directly. UI display mapping stays in mapCareSettingToTriage.';

-- Q5 · partial index for doctor-demand / triage filters (P1-22 consumers)
create index if not exists libertymd_reports_triage_tier_idx
  on public.libertymd_reports (triage_tier)
  where triage_tier is not null;

-- ---------------------------------------------------------------------------
-- Q2A · libertymd_diagnostic_runs.top_dx_confidence (numeric)
-- Null-safe: never raises on "70%", [], {}, non-object elements, missing keys.
-- Expression-text must retain regexp_match / (\d{1,3}(?:\.\d+)?) for AC4 contracts.
-- ---------------------------------------------------------------------------
alter table public.libertymd_diagnostic_runs
  add column if not exists top_dx_confidence numeric
  generated always as (
    case
      when jsonb_typeof(differential_diagnosis) is distinct from 'array'
        or jsonb_array_length(differential_diagnosis) = 0
        or jsonb_typeof(differential_diagnosis -> 0) is distinct from 'object'
        then null
      when (
        case
          when jsonb_typeof((differential_diagnosis -> 0) -> 'confidence') in ('number', 'string')
            then (differential_diagnosis -> 0) ->> 'confidence'
          when jsonb_typeof((differential_diagnosis -> 0) -> 'confidence_score') in ('number', 'string')
            then (differential_diagnosis -> 0) ->> 'confidence_score'
          else null
        end
      ) ~ '(\d{1,3}(?:\.\d+)?)'
        then least(
          100::numeric,
          greatest(
            0::numeric,
            (
              regexp_match(
                case
                  when jsonb_typeof((differential_diagnosis -> 0) -> 'confidence') in ('number', 'string')
                    then (differential_diagnosis -> 0) ->> 'confidence'
                  when jsonb_typeof((differential_diagnosis -> 0) -> 'confidence_score') in ('number', 'string')
                    then (differential_diagnosis -> 0) ->> 'confidence_score'
                  else null
                end,
                '(\d{1,3}(?:\.\d+)?)'
              )
            )[1]::numeric
          )
        )
      else null
    end
  ) stored;

comment on column public.libertymd_diagnostic_runs.top_dx_confidence is
  'P1-21 STORED generated. Null-safe numeric from differential_diagnosis[0].confidence then .confidence_score; percent strings ("70%") parsed via regexp digit extract clamped 0–100 (mirror parseConfidence). Empty/malformed → NULL. Coexists with real confidence_score (write-path may disagree when raw.confidence_score was trusted). JSONB remains SoT — never write this column directly.';

-- Q5 · optional partial index for non-null confidence filters
create index if not exists libertymd_diagnostic_runs_top_dx_confidence_idx
  on public.libertymd_diagnostic_runs (top_dx_confidence)
  where top_dx_confidence is not null;

-- ---------------------------------------------------------------------------
-- Q3A · libertymd_consultations.filled_slot_count (smallint)
-- CORE_SLOTS: onset, duration, severity, associated_symptoms, red_flag_negatives, relevant_history
-- Filled iff key present with non-null / non-empty-string / non-empty-array (≈ calculateMissingSlots).
-- Does NOT apply clinical-policy hasValue uncertain-phrase filter.
-- ---------------------------------------------------------------------------
alter table public.libertymd_consultations
  add column if not exists filled_slot_count smallint
  generated always as (
    (
      case
        when filled_slots is null or jsonb_typeof(filled_slots) is distinct from 'object' then 0
        else
          (case
            when filled_slots ? 'onset'
              and jsonb_typeof(filled_slots -> 'onset') is distinct from 'null'
              and not (
                jsonb_typeof(filled_slots -> 'onset') = 'string'
                and coalesce(filled_slots ->> 'onset', '') = ''
              )
              and not (
                jsonb_typeof(filled_slots -> 'onset') = 'array'
                and jsonb_array_length(filled_slots -> 'onset') = 0
              )
            then 1 else 0
          end)
          + (case
            when filled_slots ? 'duration'
              and jsonb_typeof(filled_slots -> 'duration') is distinct from 'null'
              and not (
                jsonb_typeof(filled_slots -> 'duration') = 'string'
                and coalesce(filled_slots ->> 'duration', '') = ''
              )
              and not (
                jsonb_typeof(filled_slots -> 'duration') = 'array'
                and jsonb_array_length(filled_slots -> 'duration') = 0
              )
            then 1 else 0
          end)
          + (case
            when filled_slots ? 'severity'
              and jsonb_typeof(filled_slots -> 'severity') is distinct from 'null'
              and not (
                jsonb_typeof(filled_slots -> 'severity') = 'string'
                and coalesce(filled_slots ->> 'severity', '') = ''
              )
              and not (
                jsonb_typeof(filled_slots -> 'severity') = 'array'
                and jsonb_array_length(filled_slots -> 'severity') = 0
              )
            then 1 else 0
          end)
          + (case
            when filled_slots ? 'associated_symptoms'
              and jsonb_typeof(filled_slots -> 'associated_symptoms') is distinct from 'null'
              and not (
                jsonb_typeof(filled_slots -> 'associated_symptoms') = 'string'
                and coalesce(filled_slots ->> 'associated_symptoms', '') = ''
              )
              and not (
                jsonb_typeof(filled_slots -> 'associated_symptoms') = 'array'
                and jsonb_array_length(filled_slots -> 'associated_symptoms') = 0
              )
            then 1 else 0
          end)
          + (case
            when filled_slots ? 'red_flag_negatives'
              and jsonb_typeof(filled_slots -> 'red_flag_negatives') is distinct from 'null'
              and not (
                jsonb_typeof(filled_slots -> 'red_flag_negatives') = 'string'
                and coalesce(filled_slots ->> 'red_flag_negatives', '') = ''
              )
              and not (
                jsonb_typeof(filled_slots -> 'red_flag_negatives') = 'array'
                and jsonb_array_length(filled_slots -> 'red_flag_negatives') = 0
              )
            then 1 else 0
          end)
          + (case
            when filled_slots ? 'relevant_history'
              and jsonb_typeof(filled_slots -> 'relevant_history') is distinct from 'null'
              and not (
                jsonb_typeof(filled_slots -> 'relevant_history') = 'string'
                and coalesce(filled_slots ->> 'relevant_history', '') = ''
              )
              and not (
                jsonb_typeof(filled_slots -> 'relevant_history') = 'array'
                and jsonb_array_length(filled_slots -> 'relevant_history') = 0
              )
            then 1 else 0
          end)
      end
    )::smallint
  ) stored;

comment on column public.libertymd_consultations.filled_slot_count is
  'P1-21 STORED generated. Count (0–6) of CORE_SLOTS (onset, duration, severity, associated_symptoms, red_flag_negatives, relevant_history) with non-null / non-empty-string / non-empty-array values — SQL ≈ calculateMissingSlots complement. Does not apply hasValue uncertain-phrase filter. JSONB filled_slots remains SoT — never write this column directly.';

-- Q5 · plain B-tree for progress / stall cuts
create index if not exists libertymd_consultations_filled_slot_count_idx
  on public.libertymd_consultations (filled_slot_count);

-- ---------------------------------------------------------------------------
-- Q6B · recreate libertymd_turn_facts — prefer generated cols
-- Preserve P1-20 locks: series spine, DISTINCT ON, plain VIEW, revoke-all,
-- PHI allow-list / ban list, stall target_slot. No reports join for triage.
-- DROP first: CREATE OR REPLACE cannot rename/reorder view columns
-- (P1-20 ended with is_speculative; this revision inserts top_dx_confidence
-- before it → SQLSTATE 42P16 without DROP).
-- ---------------------------------------------------------------------------
drop view if exists public.libertymd_turn_facts;
create view public.libertymd_turn_facts as
with turn_spine as (
  select
    c.id as consultation_id,
    c.user_id,
    c.patient_id,
    c.landing_session_id,
    c.status,
    c.target_slot as consult_target_slot,
    c.clinical_evidence_score,
    c.filled_slot_count,
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
    top_dx_confidence,
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
  d.top_dx_confidence,
  d.is_speculative,
  t.clinical_evidence_score,
  t.filled_slot_count,
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
  'P1-20/P1-21 PHI-safe turn-grain fact view. Spine: generate_series(1, GREATEST(consultations.turn_count,1)) as turn_index. LEFT JOIN safety_events + diagnostic_runs on (consultation_id, turn_count=turn_index) with DISTINCT ON dedup (safety: created_at DESC; diagnosis: is_speculative ASC then created_at DESC). Messages: assistant target_slot only (awaiting/next); max-turn coalesce to consultations.target_slot for stallable statuses. Allow-list: consultation_id, user_id, patient_id, landing_session_id, status, turn_index, target_slot, safety_status, risk_level, force_end, safety_source, crisis_type, care_setting, run_status, confidence_score, evidence_score, top_dx_confidence, is_speculative, clinical_evidence_score, filled_slot_count, timestamps. Ban: content, slot_updates, filled_slots, missing_slots, chief_complaint, safety message/red_flags/raw_result, diagnosis JSONB blobs, options, metadata, validation_reason, patient_snapshot, safety_state, intermediate_diagnoses, report bodies, emails, names, triage_tier (join reports directly for P1-22). P1-21 prefers generated filled_slot_count + top_dx_confidence (no competing JSONB extract); keeps real confidence_score. care_setting here is safety categorical — not reports.triage_tier. Consumers: ops/service_role only — REVOKE ALL from anon/authenticated/public. Complementary to product_events turn_* — not a substitute.';

-- Q6B · re-REVOKE after REPLACE (mirror P1-20 Q3A)
revoke all on table public.libertymd_turn_facts from anon, authenticated;
revoke all on table public.libertymd_turn_facts from public;
