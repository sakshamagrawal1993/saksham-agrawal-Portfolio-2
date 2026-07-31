-- P4-02 · AC5 — triage tier × saw_doctor cross-tab (+ confidence / turn_count)
--
-- Durable SoT: libertymd_followup_checkins.saw_doctor (nullable categorical).
-- Join path (Open Q6):
--   reports.triage_tier
--   consultations.turn_count
--   diagnostic confidence = acted-upon (is_speculative = false when present)
--     top_dx_confidence else confidence_score
-- Do NOT copy confidence onto the follow-up ledger.
-- Do NOT emit triage / confidence / turn_count on Mixpanel followup_responded.
--
-- Ops artifact — runnable against fixture or live (service_role / SQL editor).
-- Live Mixpanel board = DoD+ / CANNOT RUN.

-- ---------------------------------------------------------------------------
-- Cross-tab: reports.triage_tier × checkins.saw_doctor
-- ---------------------------------------------------------------------------
select
  coalesce(r.triage_tier::text, '(no report tier)') as triage_tier,
  coalesce(f.saw_doctor, '(skipped / null)') as saw_doctor,
  count(*) as checkin_rows,
  count(*) filter (where f.report_match is not null) as with_report_match,
  round(avg(c.turn_count)::numeric, 2) as avg_turn_count,
  round(
    avg(
      coalesce(
        (
          select coalesce(dr.top_dx_confidence, dr.confidence_score)
          from public.libertymd_diagnostic_runs dr
          where dr.consultation_id = c.id
            and (dr.is_speculative is distinct from true)
          order by dr.created_at desc nulls last
          limit 1
        ),
        null
      )
    )::numeric,
    4
  ) as avg_acted_upon_confidence
from public.libertymd_followup_checkins f
join public.libertymd_consultations c
  on c.id = f.consultation_id
left join public.libertymd_reports r
  on r.consultation_id = f.consultation_id
where f.status = 'responded'
group by 1, 2
order by 1, 2;

-- ---------------------------------------------------------------------------
-- Row-level join sketch (debug / sample)
-- ---------------------------------------------------------------------------
-- select
--   f.id as checkin_id,
--   f.consultation_id,
--   f.answer,
--   f.saw_doctor,
--   f.report_match,
--   r.triage_tier,
--   c.turn_count,
--   (
--     select coalesce(dr.top_dx_confidence, dr.confidence_score)
--     from public.libertymd_diagnostic_runs dr
--     where dr.consultation_id = c.id
--       and (dr.is_speculative is distinct from true)
--     order by dr.created_at desc nulls last
--     limit 1
--   ) as acted_upon_confidence
-- from public.libertymd_followup_checkins f
-- join public.libertymd_consultations c on c.id = f.consultation_id
-- left join public.libertymd_reports r on r.consultation_id = f.consultation_id
-- where f.saw_doctor is not null
-- order by f.responded_at desc nulls last
-- limit 50;
