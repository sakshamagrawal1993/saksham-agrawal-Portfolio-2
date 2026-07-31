-- P1-24 · Extend cleanup to Storage objects
--
-- AC1 historical: As of P1-23, cleanup_expired_libertymd_data() deleted Postgres
--   only (no Storage). That ban remains on the P1-23 migration file.
-- This migration: private clinical bucket + path contract + orphan SQL + dry-run
--   Storage would-delete counts. Retention deletes go through the Storage API
--   Edge runner (libertymd-cleanup-storage) — NEVER SQL DELETE FROM storage.objects
--   as the retention mechanism (metadata-only / may be blocked; orphans store bytes).
-- Bucket allow-list: libertymd-care ONLY. Never target libertymd-assets (marketing).
-- Path contract: {consultation_id}/{kind}/{object_uuid} with kind ∈ {photo, lab}.
-- Coupling: Postgres cleanup first (P1-23 unchanged) → Edge orphan reconcile.
-- Upload UI / policies deferred to P4-06/07. Never commit service-role keys.

-- ---------------------------------------------------------------------------
-- Private clinical bucket (empty; write/upload policies deferred to P4)
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'libertymd-care',
  'libertymd-care',
  false,
  20971520, -- 20 MiB backstop; P4 may tighten
  null
)
on conflict (id) do update set
  public = false,
  name = excluded.name;

-- Deny-public: drop any accidental public/anon policies if re-applied later.
-- With public=false and no anon/authenticated policies, RLS denies client access;
-- service_role (Edge cleanup + future P4 proxy writers) bypasses RLS.
drop policy if exists "Public read libertymd-care" on storage.objects;
drop policy if exists "Anon upload libertymd-care" on storage.objects;
drop policy if exists "Anon update libertymd-care" on storage.objects;
drop policy if exists "Authenticated read libertymd-care" on storage.objects;
drop policy if exists "Authenticated upload libertymd-care" on storage.objects;

-- Path ownership (AC4) — without reading object contents / EXIF:
--   name = '{consultation_id}/{kind}/{object_uuid}'
--   kind ∈ {photo, lab}
-- Cleanup / orphan detection keys off first path segment = consultation_id (UUID).
-- No free-text / original filenames as path segments.

-- ---------------------------------------------------------------------------
-- Orphan detection: libertymd-care objects whose consultation_id ∉ live consults
-- ---------------------------------------------------------------------------
create or replace function public.list_libertymd_care_storage_orphans()
returns table (
  object_path text,
  consultation_id_text text
)
language sql
stable
security definer
set search_path = public, storage
as $$
  select
    o.name::text as object_path,
    split_part(o.name, '/', 1) as consultation_id_text
  from storage.objects o
  where o.bucket_id = 'libertymd-care'
    and split_part(o.name, '/', 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    and not exists (
      select 1
      from public.libertymd_consultations c
      where c.id::text = split_part(o.name, '/', 1)
    )
  order by o.name;
$$;

comment on function public.list_libertymd_care_storage_orphans() is
  'P1-24 orphan detect for bucket libertymd-care. Path first segment = consultation_id; rows where that id is not in libertymd_consultations. Metadata SELECT only — Edge runner deletes via Storage API. service_role only.';

-- Count helper used by dry-run (would-delete after Postgres + orphan reconcile).
-- Includes: (a) already-orphaned paths, (b) objects under consults that would be
-- deleted this Postgres run (expired anon). Zero mutations.
create or replace function public.count_libertymd_care_storage_would_delete()
returns bigint
language sql
stable
security definer
set search_path = public, storage
as $$
  select count(*)::bigint
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
$$;

comment on function public.count_libertymd_care_storage_would_delete() is
  'P1-24 dry-run Storage would-delete count for libertymd-care (metadata rows). Includes orphans + objects under would-be-deleted expired anon consults. Zero mutations. Not retention — Edge API removes bytes.';

-- ---------------------------------------------------------------------------
-- Extend dry-run twin with deleted_storage_objects (would-delete; zero mutations)
-- Postgres destructive RETURNS unchanged (P1-23). Storage ops count lives here
-- + Edge runner log line deleted_storage_objects.
-- DROP first: OUT list grows vs P1-23 (SQLSTATE 42P13 otherwise).
-- ---------------------------------------------------------------------------
drop function if exists public.cleanup_expired_libertymd_data_dry_run();
create function public.cleanup_expired_libertymd_data_dry_run()
returns table (
  deleted_consultations bigint,
  deleted_profiles bigint,
  deleted_landing_sessions bigint,
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
  storage_count bigint;
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

  raise notice 'libertymd cleanup dry-run: would_delete_consultations=% would_delete_profiles=% would_delete_landing_sessions=% would_delete_storage_objects=%',
    consultation_count, profile_count, landing_count, storage_count;

  return query select consultation_count, profile_count, landing_count, storage_count;
end;
$$;

comment on function public.cleanup_expired_libertymd_data_dry_run() is
  'P1-23/P1-24 SELECT-only twin. Zero mutations. Postgres predicates unchanged; deleted_storage_objects = libertymd-care metadata would-delete count (orphans + expired-anon prefixes). Byte delete is Edge Storage API only. service_role only. Run before enabling destructive prod Storage purge.';

revoke all on function public.list_libertymd_care_storage_orphans() from public, anon, authenticated;
revoke all on function public.count_libertymd_care_storage_would_delete() from public, anon, authenticated;
revoke all on function public.cleanup_expired_libertymd_data_dry_run() from public, anon, authenticated;

grant execute on function public.list_libertymd_care_storage_orphans() to service_role;
grant execute on function public.count_libertymd_care_storage_would_delete() to service_role;
grant execute on function public.cleanup_expired_libertymd_data_dry_run() to service_role;
