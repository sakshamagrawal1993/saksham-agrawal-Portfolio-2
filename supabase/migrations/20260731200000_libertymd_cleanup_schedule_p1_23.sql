-- P1-23 · Schedule + extend cleanup_expired_libertymd_data()
--
-- Extends retention cleanup:
--   1) expired anonymous consultations (unchanged predicate)
--   2) orphan anonymous profiles (unchanged predicate)
--   3) expired AND unreferenced landing sessions (Q2B — never expire-only)
-- Delete order: consults first, then profiles, then landings.
-- Leaves libertymd_product_events rows (ON DELETE SET NULL). Never deletes auth.users.
-- No Storage deletes (P1-24). No care_interest branch — table does not exist yet
--   (when libertymd_care_interest exists with retention_expires_at, P2-12 / follow-on
--   must add the delete branch; CARE documents the conditional skip).
-- Dual-path schedule: idempotent cron.schedule only if pg_cron is present;
--   otherwise migration no-ops schedule and CARE / scripts/sql runbook apply.
-- Dry-run twin: cleanup_expired_libertymd_data_dry_run() — SELECT counts only.
-- Hard gate: do not enable destructive production schedule until dry-run counts recorded.

-- ---------------------------------------------------------------------------
-- Destructive cleanup (service_role)
-- ---------------------------------------------------------------------------
create or replace function public.cleanup_expired_libertymd_data()
returns table (
  deleted_consultations bigint,
  deleted_profiles bigint,
  deleted_landing_sessions bigint
)
language plpgsql
security definer
set search_path = public
as $$
declare
  consultation_count bigint;
  profile_count bigint;
  landing_count bigint;
begin
  -- 1) Expired anonymous consultations (linked / NULL retention never match).
  with deleted as (
    delete from public.libertymd_consultations c
    using public.libertymd_profiles p
    where c.user_id = p.user_id
      and p.is_anonymous = true
      and c.retention_expires_at is not null
      and c.retention_expires_at < now()
    returning c.id
  )
  select count(*) into consultation_count from deleted;

  -- 2) Orphan anonymous profiles (no remaining consultations).
  with deleted as (
    delete from public.libertymd_profiles p
    where p.is_anonymous = true
      and p.updated_at < now() - interval '30 days'
      and not exists (
        select 1 from public.libertymd_consultations c where c.user_id = p.user_id
      )
    returning p.id
  )
  select count(*) into profile_count from deleted;

  -- 3) Expired orphan landings only (Q2B). After consult deletes, FK refs are gone
  --    so landings that only pointed at purged anon consults become deletable.
  --    Landings still referenced by surviving (esp. linked / NULL-retention) consults
  --    are kept past retention_expires_at until the consult is gone or FK cleared.
  with deleted as (
    delete from public.libertymd_landing_sessions l
    where l.retention_expires_at is not null
      and l.retention_expires_at < now()
      and not exists (
        select 1
        from public.libertymd_consultations c
        where c.landing_session_id = l.id
      )
    returning l.id
  )
  select count(*) into landing_count from deleted;

  raise log 'libertymd cleanup: deleted_consultations=% deleted_profiles=% deleted_landing_sessions=%',
    consultation_count, profile_count, landing_count;
  raise notice 'libertymd cleanup: deleted_consultations=% deleted_profiles=% deleted_landing_sessions=%',
    consultation_count, profile_count, landing_count;

  return query select consultation_count, profile_count, landing_count;
end;
$$;

comment on function public.cleanup_expired_libertymd_data() is
  'P1-23 daily retention cleanup. Deletes expired anon consults, orphan anon profiles, and expired unreferenced landing sessions (consults first). Leaves product_events. No Storage. No care_interest until that table exists (P2-12). service_role only. Schedule: 0 7 * * * UTC via pg_cron when present, else Dashboard Cron / runbook. Dry-run before first destructive production apply.';

-- ---------------------------------------------------------------------------
-- Dry-run twin — zero mutations; same predicates (landing accounts for consults
-- that would be deleted in the same run so counts match the destructive path).
-- ---------------------------------------------------------------------------
create or replace function public.cleanup_expired_libertymd_data_dry_run()
returns table (
  deleted_consultations bigint,
  deleted_profiles bigint,
  deleted_landing_sessions bigint
)
language plpgsql
security definer
set search_path = public
as $$
declare
  consultation_count bigint;
  profile_count bigint;
  landing_count bigint;
begin
  select count(*)::bigint into consultation_count
  from public.libertymd_consultations c
  join public.libertymd_profiles p on p.user_id = c.user_id
  where p.is_anonymous = true
    and c.retention_expires_at is not null
    and c.retention_expires_at < now();

  select count(*)::bigint into profile_count
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

  -- Landings that would be unreferenced after the consult deletes above.
  select count(*)::bigint into landing_count
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

  raise notice 'libertymd cleanup dry-run: would_delete_consultations=% would_delete_profiles=% would_delete_landing_sessions=%',
    consultation_count, profile_count, landing_count;

  return query select consultation_count, profile_count, landing_count;
end;
$$;

comment on function public.cleanup_expired_libertymd_data_dry_run() is
  'P1-23 SELECT-only twin of cleanup_expired_libertymd_data(). Zero mutations. Same predicates; landing count includes rows that become orphan after would-be consult deletes. service_role only. Run before enabling destructive production schedule.';

-- Grants: service_role only (restoreoke from public / anon / authenticated).
revoke all on function public.cleanup_expired_libertymd_data() from public, anon, authenticated;
revoke all on function public.cleanup_expired_libertymd_data_dry_run() from public, anon, authenticated;
grant execute on function public.cleanup_expired_libertymd_data() to service_role;
grant execute on function public.cleanup_expired_libertymd_data_dry_run() to service_role;

-- ---------------------------------------------------------------------------
-- Optional pg_cron (dual-path Q1): schedule only if extension already present.
-- Never create extension here. Never commit service-role keys.
-- Cadence: 0 7 * * * UTC.
-- ---------------------------------------------------------------------------
do $schedule$
declare
  existing_jobid bigint;
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    begin
      select j.jobid into existing_jobid
      from cron.job j
      where j.jobname = 'libertymd-cleanup-expired'
      limit 1;

      if existing_jobid is not null then
        perform cron.unschedule(existing_jobid);
      end if;

      perform cron.schedule(
        'libertymd-cleanup-expired',
        '0 7 * * *',
        $cron$select public.cleanup_expired_libertymd_data()$cron$
      );
      raise notice 'P1-23: scheduled libertymd-cleanup-expired at 0 7 * * * UTC';
    exception
      when undefined_table then
        raise notice 'P1-23: cron.job unavailable — schedule skipped; use Dashboard Cron / scripts/sql/libertymd-cleanup-cron-runbook.sql';
      when others then
        raise notice 'P1-23: pg_cron schedule skipped (%); use Dashboard Cron / scripts/sql/libertymd-cleanup-cron-runbook.sql', sqlerrm;
    end;
  else
    raise notice 'P1-23: pg_cron absent — schedule no-op; use Dashboard Cron / scripts/sql/libertymd-cleanup-cron-runbook.sql at 0 7 * * * UTC. Do not enable destructive prod until dry-run counts recorded.';
  end if;
end;
$schedule$;
