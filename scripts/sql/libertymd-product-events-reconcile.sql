-- P1-15 DoD+ · consultation_started ↔ consultations reconcile (post-deploy / live SQL).
-- Not a green `:ci` gate. Historical ~6% gap is DoD+ / post-deploy evidence only.
--
-- Usage: set :from / :to (or substitute timestamps) for the window after the
-- P1-15 reliability fix ships. New successful creates must not orphan.

-- Orphans: consultations without a matching consultation_started product event
select
  c.id as consultation_id,
  c.created_at,
  c.status,
  c.user_id
from public.libertymd_consultations c
left join public.libertymd_product_events e
  on e.consultation_id = c.id
 and e.event_name = 'consultation_started'
where c.created_at >= timestamptz '2026-07-31'
  and c.created_at <  timestamptz '2026-08-01'
  and e.id is null
order by c.created_at;

-- Counts for the same window
select
  (select count(*) from public.libertymd_consultations
    where created_at >= timestamptz '2026-07-31'
      and created_at <  timestamptz '2026-08-01') as consultations,
  (select count(*) from public.libertymd_product_events
    where event_name = 'consultation_started'
      and created_at >= timestamptz '2026-07-31'
      and created_at <  timestamptz '2026-08-01') as consultation_started_events;
