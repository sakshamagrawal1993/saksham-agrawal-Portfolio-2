-- P4-06 · Photo upload (proxy sole writer)
--
-- Keeps bucket libertymd-care private (public=false). Tightens allowed_mime_types
-- to jpeg/png/webp as a Storage backstop; product max remains 5 MiB (proxy) while
-- bucket file_size_limit stays 20 MiB (P1-24 backstop).
-- Prefer service_role writes via libertymd-care-proxy upload_photo — no anon /
-- authenticated INSERT/SELECT policies (public read forbidden).
-- No attachments table (durable SoT = Storage path {consultation_id}/photo/{uuid}).
-- Lab ingest = P4-07. Never commit service-role keys.

update storage.buckets
set
  public = false,
  allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp']::text[]
where id = 'libertymd-care';

-- Defense in depth: drop any accidental public/anon/authenticated object policies.
drop policy if exists "Public read libertymd-care" on storage.objects;
drop policy if exists "Anon upload libertymd-care" on storage.objects;
drop policy if exists "Anon update libertymd-care" on storage.objects;
drop policy if exists "Anon read libertymd-care" on storage.objects;
drop policy if exists "Authenticated read libertymd-care" on storage.objects;
drop policy if exists "Authenticated upload libertymd-care" on storage.objects;
drop policy if exists "Authenticated update libertymd-care" on storage.objects;
