-- P1-22 · LibertyMD funnel dashboard SQL pack
-- Checked-in ops artifact (not a Postgres view; not a turn_facts rebuild).
-- Live non-empty results = DoD+ (needs traffic). Safe on empty tables.
--
-- Sections:
--   (1) Per-turn survival          — alias of P1-20 (a)
--   (2) Stall-by-slot              — alias of P1-20 (b)
--   (3) Emergency rate by source   — AC2 SoT: product_events emergency_stopped
--   (4) Reliability panel          — AC4: inference_failed / (failed+completed)
--   (5) Doctor demand by triage    — reports.triage_tier
--   (6) Cohort filter examples     — P1-01 + P1-08 (2026-07-31)
--
-- Optional clinical companion (NOT the named AC2 query):
--   select source, count(*) from libertymd_safety_events
--     where status = 'force_end' group by source;
--   or turn_facts where force_end is true group by safety_source.

-- ---------------------------------------------------------------------------
-- (1) FUNNEL_SURVIVAL · Per-turn survival (P1-20 alias)
-- ---------------------------------------------------------------------------
-- Marker: FUNNEL_SURVIVAL
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
-- (2) FUNNEL_STALL · Stall distribution by awaiting/next target_slot (P1-20 alias)
-- ---------------------------------------------------------------------------
-- Marker: FUNNEL_STALL
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
-- (3) FUNNEL_EMERGENCY_BY_SOURCE · AC2 named emergency rate (Q3A)
--     SoT: libertymd_product_events event_name = 'emergency_stopped'
--     Group by categorical properties->>'source' only (no free-text).
--     Numerator grain: distinct consultation_id per source.
--     Denominator: all consultations in the same window (unfiltered below =
--     all-time; add created_at bounds in cohort section as needed).
-- ---------------------------------------------------------------------------
-- Marker: FUNNEL_EMERGENCY_BY_SOURCE
with emergency_events as (
  select
    consultation_id,
    coalesce(nullif(trim(properties->>'source'), ''), 'unknown') as source
  from public.libertymd_product_events
  where event_name = 'emergency_stopped'
),
by_source as (
  select
    source,
    count(distinct consultation_id)::bigint as emergency_consults
  from emergency_events
  group by source
),
denom as (
  select count(*)::bigint as all_consults
  from public.libertymd_consultations
)
select
  b.source,
  b.emergency_consults,
  d.all_consults,
  (
    b.emergency_consults::float / nullif(d.all_consults, 0)
  ) as emergency_rate_vs_all_consults
from by_source b
cross join denom d
order by b.emergency_consults desc, b.source;

-- ---------------------------------------------------------------------------
-- (4) FUNNEL_RELIABILITY · fail rate by stage / error_class (Q4A)
--     Postgres SoT (no client collision):
--       inference_failed / (inference_failed + turn_completed)
--     Mixpanel mirror: LibertyMd turn_failed / turn_completed with
--       emit_origin = 'server' AND app_surface = 'libertymd'
-- ---------------------------------------------------------------------------
-- Marker: FUNNEL_RELIABILITY
select
  coalesce(nullif(trim(properties->>'stage'), ''), 'unknown') as stage,
  coalesce(nullif(trim(properties->>'error_class'), ''), 'n/a') as error_class,
  count(*) filter (where event_name = 'inference_failed')::bigint as inference_failed,
  count(*) filter (where event_name = 'turn_completed')::bigint as turn_completed,
  (
    count(*) filter (where event_name = 'inference_failed')::float
    / nullif(
      count(*) filter (where event_name = 'inference_failed')
        + count(*) filter (where event_name = 'turn_completed'),
      0
    )
  ) as reliability_fail_rate
from public.libertymd_product_events
where event_name in ('inference_failed', 'turn_completed')
group by 1, 2
order by reliability_fail_rate desc nulls last, inference_failed desc;

-- ---------------------------------------------------------------------------
-- (5) FUNNEL_DOCTOR_DEMAND · report release demand by reports.triage_tier
--     Mixpanel funnel is report_ready → report_released without triage breakout.
--     This SQL is the Done SoT for "by triage tier" (Q7A).
-- ---------------------------------------------------------------------------
-- Marker: FUNNEL_DOCTOR_DEMAND
select
  coalesce(nullif(trim(r.triage_tier), ''), 'unknown') as triage_tier,
  count(distinct r.consultation_id)::bigint as report_rows,
  count(distinct pe_ready.consultation_id)::bigint as report_ready_consults,
  count(distinct pe_release.consultation_id)::bigint as report_released_consults
from public.libertymd_reports r
left join public.libertymd_product_events pe_ready
  on pe_ready.consultation_id = r.consultation_id
 and pe_ready.event_name = 'report_ready'
left join public.libertymd_product_events pe_release
  on pe_release.consultation_id = r.consultation_id
 and pe_release.event_name in ('report_released_guest', 'report_saved_google')
group by 1
order by report_rows desc, triage_tier;

-- ---------------------------------------------------------------------------
-- (5b) FUNNEL_CARE_INTEREST_JOIN_RATE · waitlist join rate by triage_tier (P2-12)
--     Numerator: distinct care_interest.consultation_id
--     Denominator: distinct reports.consultation_id (report-present consults)
--     Unknown bucket: coalesce(nullif(trim(…),''),'unknown') — same as FUNNEL_DOCTOR_DEMAND.
--     Click-through (doctor_cta_clicked / doctor_cta_viewed) = deferred to P2-11 (dark).
-- ---------------------------------------------------------------------------
-- Marker: FUNNEL_CARE_INTEREST_JOIN_RATE
select
  coalesce(nullif(trim(r.triage_tier), ''), 'unknown') as triage_tier,
  count(distinct r.consultation_id)::bigint as report_consults,
  count(distinct ci.consultation_id)::bigint as care_interest_joins,
  (
    count(distinct ci.consultation_id)::float
    / nullif(count(distinct r.consultation_id), 0)
  ) as join_rate
from public.libertymd_reports r
left join public.libertymd_care_interest ci
  on ci.consultation_id = r.consultation_id
group by 1
order by report_consults desc, triage_tier;

-- ---------------------------------------------------------------------------
-- (6) FUNNEL_COHORT · P1-01 + P1-08 + P2-14 date-filter examples (boundary 2026-07-31 UTC)
-- ---------------------------------------------------------------------------
-- Marker: FUNNEL_COHORT
-- Marker: P1-01
-- Marker: P1-08
-- Marker: P2-14
-- Marker: 2026-07-31
-- Marker: was_speculative
-- Marker: served_from_cache
-- Marker: report_ready
-- Marker: outcome=valid

-- P1-01 · demographics conversion before vs on/after unified entry
select
  case
    when e.created_at < timestamptz '2026-07-31 00:00:00+00' then 'before_p1_01'
    else 'on_or_after_p1_01'
  end as cohort,
  count(distinct e.consultation_id) filter (
    where e.event_name = 'consultation_started'
  )::bigint as consult_started,
  count(distinct e.consultation_id) filter (
    where e.event_name = 'demographics_saved'
  )::bigint as demographics_saved
from public.libertymd_product_events e
where e.event_name in ('consultation_started', 'demographics_saved')
group by 1
order by 1;

-- P1-08 · speculative diagnosis props before vs on/after ship day
-- Honesty: LIBERTYMD_SPECULATIVE_DIAGNOSIS defaults off — post-enable cohort
-- may be empty until ops enables the flag; empty ≠ empty is OK.
select
  case
    when e.created_at < timestamptz '2026-07-31 00:00:00+00' then 'before_p1_08'
    else 'on_or_after_p1_08'
  end as cohort,
  count(*) filter (
    where (e.properties->>'was_speculative')::boolean is true
  )::bigint as was_speculative_true,
  count(*) filter (
    where (e.properties->>'served_from_cache')::boolean is true
  )::bigint as served_from_cache_true,
  count(*)::bigint as diagnosis_attempted_rows
from public.libertymd_product_events e
where e.event_name = 'diagnosis_attempted'
group by 1
order by 1;

-- P2-14 · completion + report validity before vs on/after eligibility retune
-- Completion: report_ready distinct consultation_id (and/or status ∈ completed /
-- report_pending_auth). Validity: diagnosis_attempted outcome=valid and/or
-- non-speculative diagnostic_runs.run_status=validated. No new event names.
select
  case
    when e.created_at < timestamptz '2026-07-31 00:00:00+00' then 'before_p2_14'
    else 'on_or_after_p2_14'
  end as cohort,
  count(distinct e.consultation_id) filter (
    where e.event_name = 'report_ready'
  )::bigint as report_ready_consults,
  count(distinct e.consultation_id) filter (
    where e.event_name = 'diagnosis_attempted'
      and e.properties->>'outcome' = 'valid'
  )::bigint as diagnosis_valid_consults,
  count(distinct e.consultation_id) filter (
    where e.event_name = 'diagnosis_attempted'
  )::bigint as diagnosis_attempted_consults
from public.libertymd_product_events e
where e.event_name in ('report_ready', 'diagnosis_attempted')
group by 1
order by 1;

-- P2-14 · non-speculative validated diagnostic runs (acted-upon validity)
select
  case
    when r.created_at < timestamptz '2026-07-31 00:00:00+00' then 'before_p2_14'
    else 'on_or_after_p2_14'
  end as cohort,
  count(*) filter (
    where r.run_status = 'validated'
      and coalesce(r.is_speculative, false) is false
  )::bigint as validated_non_spec_runs,
  count(*)::bigint as diagnostic_run_rows
from public.libertymd_diagnostic_runs r
group by 1
order by 1;
