-- P1-23 / P1-24 · Dry-run gate for cleanup_expired_libertymd_data()
--
-- ZERO MUTATIONS. Prefer the twin function when applied:
--   select * from public.cleanup_expired_libertymd_data_dry_run();
--
-- This script is the human-readable twin of the same predicates for SQL Editor /
-- ops review when the function is not yet applied, or for side-by-side audit.
--
-- HARD GATE: record these counts before enabling the destructive daily schedule
-- in production (Postgres + Storage). Do not run cleanup_expired_libertymd_data()
-- or enable libertymd-cleanup-storage destructive mode on prod until then.
--
-- Cadence (when schedule is enabled): 0 7 * * * UTC (Postgres);
--   Storage Edge reconcile same family (+5m OK) — see cron runbook.
-- See also: scripts/sql/libertymd-cleanup-cron-runbook.sql
--           scripts/sql/libertymd-storage-orphan-detect.sql

-- ---------------------------------------------------------------------------
-- 1) Would-delete: expired anonymous consultations
-- ---------------------------------------------------------------------------
select
  count(*)::bigint as would_delete_consultations
from public.libertymd_consultations c
join public.libertymd_profiles p on p.user_id = c.user_id
where p.is_anonymous = true
  and c.retention_expires_at is not null
  and c.retention_expires_at < now();

-- ---------------------------------------------------------------------------
-- 2) Would-delete: orphan anonymous profiles (after would-be consult deletes)
-- ---------------------------------------------------------------------------
select
  count(*)::bigint as would_delete_profiles
from public.libertymd_profiles p
where p.is_anonymous = true
  and p.updated_at < now() - interval '30 days'
  and not exists (
    select 1
    from public.libertymd_consultations c
    where c.user_id = p.user_id
      and not (
        exists (
          select 1 from public.libertymd_profiles p2
          where p2.user_id = c.user_id and p2.is_anonymous = true
        )
        and c.retention_expires_at is not null
        and c.retention_expires_at < now()
      )
  );

-- ---------------------------------------------------------------------------
-- 3) Would-delete: expired AND unreferenced landings (Q2B)
--    Accounts for consults that would be deleted in the same run.
--    Referenced+expired landings under surviving (esp. linked) consults survive.
-- ---------------------------------------------------------------------------
select
  count(*)::bigint as would_delete_landing_sessions
from public.libertymd_landing_sessions l
where l.retention_expires_at is not null
  and l.retention_expires_at < now()
  and not exists (
    select 1
    from public.libertymd_consultations c
    join public.libertymd_profiles p on p.user_id = c.user_id
    where c.landing_session_id = l.id
      and not (
        p.is_anonymous = true
        and c.retention_expires_at is not null
        and c.retention_expires_at < now()
      )
  );

-- ---------------------------------------------------------------------------
-- 4) Would-delete: expired care_interest (P2-12 retention branch)
-- ---------------------------------------------------------------------------
select
  count(*)::bigint as would_delete_care_interest
from public.libertymd_care_interest ci
where ci.retention_expires_at is not null
  and ci.retention_expires_at < now();

-- ---------------------------------------------------------------------------
-- 5) Would-delete: libertymd-care Storage objects (P1-24 metadata count)
--    Includes already-orphaned paths + objects under would-be-deleted expired
--    anon consults. ZERO MUTATIONS — does not remove store bytes.
--    Bucket allow-list: libertymd-care ONLY. Never libertymd-assets.
--    Path: {consultation_id}/{kind}/{object_uuid}
-- ---------------------------------------------------------------------------
select
  count(*)::bigint as would_delete_storage_objects
from storage.objects o
where o.bucket_id = 'libertymd-care'
  and (
    not exists (
      select 1
      from public.libertymd_consultations c
      where c.id::text = split_part(o.name, '/', 1)
    )
    or exists (
      select 1
      from public.libertymd_consultations c
      join public.libertymd_profiles p on p.user_id = c.user_id
      where c.id::text = split_part(o.name, '/', 1)
        and p.is_anonymous = true
        and c.retention_expires_at is not null
        and c.retention_expires_at < now()
    )
  );

-- Explicit: marketing bucket is out of scope (must stay 0 as a cleanup target).
select
  count(*)::bigint as libertymd_assets_must_not_be_cleanup_target
from storage.objects o
where o.bucket_id = 'libertymd-assets'
  and false; -- structural no-op; documents ban

-- ---------------------------------------------------------------------------
-- Survival spot-checks (counts that must remain after a real run)
-- ---------------------------------------------------------------------------
select
  count(*)::bigint as surviving_linked_or_null_retention_consults
from public.libertymd_consultations c
where c.retention_expires_at is null;

select
  count(*)::bigint as surviving_referenced_expired_landings
from public.libertymd_landing_sessions l
where l.retention_expires_at is not null
  and l.retention_expires_at < now()
  and exists (
    select 1
    from public.libertymd_consultations c
    join public.libertymd_profiles p on p.user_id = c.user_id
    where c.landing_session_id = l.id
      and not (
        p.is_anonymous = true
        and c.retention_expires_at is not null
        and c.retention_expires_at < now()
      )
  );

-- Twin function (post-migration) — same shape as dry-run RETURNS TABLE:
-- select * from public.cleanup_expired_libertymd_data_dry_run();
-- Expected columns: deleted_consultations, deleted_profiles,
--   deleted_landing_sessions, deleted_care_interest, deleted_storage_objects
-- (counts are "would delete"; function never mutates).
-- Storage byte delete: Edge libertymd-cleanup-storage (Storage API), not SQL.
