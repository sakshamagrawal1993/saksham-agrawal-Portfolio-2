-- P2-12 — libertymd_care_interest (H4 waitlist demand store) + cleanup branch.
--
-- Waitlist intent (optional contact) — distinct from P2-08 delivery tokens and
-- from profiles.email. No marketing_consent. Proxy service-role write only.
-- Retention: retention_expires_at default now()+30d; cleanup deletes expired rows.
-- Soft gate / report visibility unchanged (DECISIONS 2026-07-30 · Report gating).

-- ---------------------------------------------------------------------------
-- Table
-- ---------------------------------------------------------------------------
create table if not exists public.libertymd_care_interest (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  consultation_id uuid not null unique
    references public.libertymd_consultations(id) on delete cascade,
  contact_email text,
  triage_tier text not null,
  created_at timestamptz not null default now(),
  retention_expires_at timestamptz not null default (now() + interval '30 days')
);

create index if not exists libertymd_care_interest_retention_idx
  on public.libertymd_care_interest (retention_expires_at)
  where retention_expires_at is not null;

create index if not exists libertymd_care_interest_triage_tier_idx
  on public.libertymd_care_interest (triage_tier);

comment on table public.libertymd_care_interest is
  'P2-12: H4 doctor-handoff waitlist demand. Proxy write only. Nullable contact_email = intent without contact. ≠ libertymd_report_delivery_tokens (P2-08). ≠ profiles.email merge. ≠ marketing consent. No clinical blobs beyond triage_tier + consultation_id.';

comment on column public.libertymd_care_interest.contact_email is
  'Optional waitlist notification preference. Null = demand without contact. Not marketing consent. Never copied to libertymd_profiles.email.';

comment on column public.libertymd_care_interest.triage_tier is
  'Server-derived categorical copy of libertymd_reports.triage_tier at join time. Never accept client free-text tier. No report_data / slots / transcripts.';

comment on column public.libertymd_care_interest.retention_expires_at is
  'P2-12 retention clock (default insert now()+30 days). Cleanup deletes when < now(). Distinct from P2-08 token expires_at.';

alter table public.libertymd_care_interest enable row level security;

-- No anon/authenticated policies: clients never read/write this table directly.
-- Proxy uses service_role (bypasses RLS). Explicit revoke of DML from client roles.
revoke all on table public.libertymd_care_interest from public, anon, authenticated;
grant select, insert, update, delete on table public.libertymd_care_interest to service_role;

-- ---------------------------------------------------------------------------
-- Destructive cleanup — extend with expired care_interest (L7)
-- Delete order: care_interest retention branch first (honest count for rows whose
-- consult still exists); then consults (CASCADE clears interest under purged
-- consults); then profiles; then landings. P1-23/24 Storage unchanged.
-- ---------------------------------------------------------------------------
create or replace function public.cleanup_expired_libertymd_data()
returns table (
  deleted_consultations bigint,
  deleted_profiles bigint,
  deleted_landing_sessions bigint,
  deleted_care_interest bigint
)
language plpgsql
security definer
set search_path = public
as $$
declare
  consultation_count bigint;
  profile_count bigint;
  landing_count bigint;
  care_interest_count bigint;
begin
  -- 0) Expired care_interest (retention branch; consult may still exist).
  with deleted as (
    delete from public.libertymd_care_interest ci
    where ci.retention_expires_at is not null
      and ci.retention_expires_at < now()
    returning ci.id
  )
  select count(*) into care_interest_count from deleted;

  -- 1) Expired anonymous consultations (linked / NULL retention never match).
  --    CASCADE also removes any remaining care_interest under deleted consults.
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

  -- 3) Expired orphan landings only (Q2B).
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

  raise log 'libertymd cleanup: deleted_consultations=% deleted_profiles=% deleted_landing_sessions=% deleted_care_interest=%',
    consultation_count, profile_count, landing_count, care_interest_count;
  raise notice 'libertymd cleanup: deleted_consultations=% deleted_profiles=% deleted_landing_sessions=% deleted_care_interest=%',
    consultation_count, profile_count, landing_count, care_interest_count;

  return query select consultation_count, profile_count, landing_count, care_interest_count;
end;
$$;

comment on function public.cleanup_expired_libertymd_data() is
  'P1-23/P2-12 daily retention cleanup. Deletes expired care_interest (retention_expires_at), expired anon consults, orphan anon profiles, and expired unreferenced landing sessions. Leaves product_events. No Storage (P1-24 Edge). service_role only. Schedule: 0 7 * * * UTC via pg_cron when present, else Dashboard Cron / runbook. Dry-run before first destructive production apply.';

-- ---------------------------------------------------------------------------
-- Dry-run twin — zero mutations; care_interest + Postgres + Storage would-delete
-- ---------------------------------------------------------------------------
create or replace function public.cleanup_expired_libertymd_data_dry_run()
returns table (
  deleted_consultations bigint,
  deleted_profiles bigint,
  deleted_landing_sessions bigint,
  deleted_care_interest bigint,
  deleted_storage_objects bigint
)
language plpgsql
security definer
set search_path = public
as $$
declare
  consultation_count bigint;
  profile_count bigint;
  landing_count bigint;
  care_interest_count bigint;
  storage_count bigint;
begin
  select count(*)::bigint into care_interest_count
  from public.libertymd_care_interest ci
  where ci.retention_expires_at is not null
    and ci.retention_expires_at < now();

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

  select public.count_libertymd_care_storage_would_delete() into storage_count;

  raise notice 'libertymd cleanup dry-run: would_delete_consultations=% would_delete_profiles=% would_delete_landing_sessions=% would_delete_care_interest=% would_delete_storage_objects=%',
    consultation_count, profile_count, landing_count, care_interest_count, storage_count;

  return query select consultation_count, profile_count, landing_count, care_interest_count, storage_count;
end;
$$;

comment on function public.cleanup_expired_libertymd_data_dry_run() is
  'P1-23/P1-24/P2-12 SELECT-only twin. Zero mutations. Postgres predicates + expired care_interest count; deleted_storage_objects = libertymd-care metadata would-delete. Byte delete is Edge Storage API only. service_role only.';

revoke all on function public.cleanup_expired_libertymd_data() from public, anon, authenticated;
revoke all on function public.cleanup_expired_libertymd_data_dry_run() from public, anon, authenticated;
grant execute on function public.cleanup_expired_libertymd_data() to service_role;
grant execute on function public.cleanup_expired_libertymd_data_dry_run() to service_role;
