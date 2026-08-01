-- P5-MEDIA — 30-day age retention for uploaded photos and lab reports.
--
-- BO 2026-08-01: delete files in `libertymd-care` older than 30 days.
--
-- This is ADDITIVE to P1-24, which deletes *orphans* (objects whose consultation
-- row is gone). Orphan detection says nothing about age: a file attached to a
-- live, linked consultation is never an orphan and would otherwise sit in the
-- bucket indefinitely. This function answers the other question — "how long may
-- an upload live at all" — and the two are unioned by the Edge runner.
--
-- Age is taken from storage.objects.created_at, the moment the bytes landed, not
-- from the consultation. A consult that stays open for six weeks still has its
-- day-1 photo removed on day 31, which is the intent: the retention promise is
-- about the file, not about the conversation.
--
-- SELECT only. Deletion goes through the Storage API in the Edge function, never
-- `delete from storage.objects` — a SQL delete removes the metadata row and
-- leaves the object bytes behind (P1-24's standing rule).

create or replace function public.list_libertymd_care_storage_expired(
  p_max_age_days integer default 30
)
returns table (
  object_path text,
  consultation_id_text text,
  age_days integer
)
language sql
stable
security definer
set search_path = public, storage
as $$
  select
    o.name::text as object_path,
    split_part(o.name, '/', 1) as consultation_id_text,
    extract(day from (now() - o.created_at))::integer as age_days
  from storage.objects o
  where o.bucket_id = 'libertymd-care'
    and o.created_at < now() - make_interval(days => greatest(p_max_age_days, 1))
$$;

comment on function public.list_libertymd_care_storage_expired(integer) is
  'P5-MEDIA age retention for bucket libertymd-care. Objects older than p_max_age_days (default 30) by storage.objects.created_at, regardless of whether the parent consultation still exists — that case is P1-24 orphan detection, and the two are unioned by the Edge runner. Metadata SELECT only; deletion goes through the Storage API. service_role only.';

revoke all on function public.list_libertymd_care_storage_expired(integer) from public;
revoke all on function public.list_libertymd_care_storage_expired(integer) from anon;
revoke all on function public.list_libertymd_care_storage_expired(integer) from authenticated;
grant execute on function public.list_libertymd_care_storage_expired(integer) to service_role;

-- Dry-run counter, mirroring the P1-24 helper so the runbook's
-- "count before you delete" step works for the age rule too.
create or replace function public.count_libertymd_care_storage_expired(
  p_max_age_days integer default 30
)
returns bigint
language sql
stable
security definer
set search_path = public, storage
as $$
  select count(*)::bigint
  from public.list_libertymd_care_storage_expired(p_max_age_days)
$$;

comment on function public.count_libertymd_care_storage_expired(integer) is
  'P5-MEDIA dry-run counter for the 30-day age rule. Run before enabling destructive cleanup in production.';

revoke all on function public.count_libertymd_care_storage_expired(integer) from public;
revoke all on function public.count_libertymd_care_storage_expired(integer) from anon;
revoke all on function public.count_libertymd_care_storage_expired(integer) from authenticated;
grant execute on function public.count_libertymd_care_storage_expired(integer) to service_role;
