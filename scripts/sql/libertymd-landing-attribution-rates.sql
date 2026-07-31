-- P1-19 AC6 · completed-consult rates by utm_campaign and by keyword_id
-- Checked-in SQL artifact only — NOT a Postgres view (P1-20 owns views).
--
-- Join: libertymd_consultations c ⋈ libertymd_landing_sessions l
--        on c.landing_session_id = l.id
-- Rate: count(*) filter (status = 'completed') / count(*) among FK-linked rows.
-- NULL campaign/keyword within linked rows → 'direct_or_unknown'.
-- Consults with NULL landing_session_id are OUT of these group-bys (AC4).
--
-- Live non-empty proof = DoD+ (needs traffic). Safe to run on empty tables.

-- Rate by utm_campaign
select
  coalesce(nullif(trim(l.utm_campaign), ''), 'direct_or_unknown') as utm_campaign,
  count(*)::bigint as started_consults,
  count(*) filter (where c.status = 'completed')::bigint as completed_consults,
  (
    count(*) filter (where c.status = 'completed')::float
    / nullif(count(*), 0)
  ) as completed_rate
from public.libertymd_consultations c
inner join public.libertymd_landing_sessions l
  on c.landing_session_id = l.id
group by 1
order by started_consults desc, utm_campaign;

-- Rate by keyword_id
select
  coalesce(nullif(trim(l.keyword_id), ''), 'direct_or_unknown') as keyword_id,
  count(*)::bigint as started_consults,
  count(*) filter (where c.status = 'completed')::bigint as completed_consults,
  (
    count(*) filter (where c.status = 'completed')::float
    / nullif(count(*), 0)
  ) as completed_rate
from public.libertymd_consultations c
inner join public.libertymd_landing_sessions l
  on c.landing_session_id = l.id
group by 1
order by started_consults desc, keyword_id;
