-- P1-24 · Orphan detection for libertymd-care Storage objects
--
-- AC3: objects whose path parent consultation_id is not in libertymd_consultations.
-- Path contract: {consultation_id}/{kind}/{object_uuid} — first segment only.
-- Bucket allow-list: libertymd-care ONLY. Never libertymd-assets.
-- This script is SELECT-only (metadata). Byte deletion is Edge Storage API
--   (supabase/functions/libertymd-cleanup-storage) — never SQL DELETE FROM
--   storage.objects as retention.
--
-- Prefer the function when applied:
--   select * from public.list_libertymd_care_storage_orphans();
-- After a successful Postgres cleanup + Edge Storage run against fixtures,
-- orphan count should be 0.

-- ---------------------------------------------------------------------------
-- Orphan rows (path ownership without reading contents)
-- ---------------------------------------------------------------------------
select
  o.name as object_path,
  split_part(o.name, '/', 1) as consultation_id_text,
  o.created_at
from storage.objects o
where o.bucket_id = 'libertymd-care'
  and split_part(o.name, '/', 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  and not exists (
    select 1
    from public.libertymd_consultations c
    where c.id::text = split_part(o.name, '/', 1)
  )
order by o.name;

-- ---------------------------------------------------------------------------
-- Orphan count (expect 0 after cleanup + Storage reconcile)
-- ---------------------------------------------------------------------------
select count(*)::bigint as orphan_storage_objects
from storage.objects o
where o.bucket_id = 'libertymd-care'
  and split_part(o.name, '/', 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  and not exists (
    select 1
    from public.libertymd_consultations c
    where c.id::text = split_part(o.name, '/', 1)
  );

-- Twin function (post-migration):
-- select * from public.list_libertymd_care_storage_orphans();
-- select public.count_libertymd_care_storage_would_delete();
