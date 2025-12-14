-- Storage Policies for InsightsLM

-- 1. Ensure the bucket exists (in case manual creation missed something or for portability)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'InsightsLM', 
  'InsightsLM', 
  false, 
  52428800, -- 50MB
  '{
    "application/pdf",
    "text/plain",
    "text/markdown",
    "audio/mpeg",
    "audio/mp3",
    "audio/wav",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  }'
)
on conflict (id) do update set 
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- 2. Policies
-- We enforce hierarchy: {user_id}/{notebook_id}/{filename} for security.
-- Ideally we'd valid notebook ownership too, but prefixing with user_id is the critical security step.

drop policy if exists "Users can upload their own files" on storage.objects;
create policy "Users can upload their own files"
on storage.objects for insert
with check (
  bucket_id = 'InsightsLM' and
  (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "Users can view their own files" on storage.objects;
create policy "Users can view their own files"
on storage.objects for select
using (
  bucket_id = 'InsightsLM' and
  (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "Users can delete their own files" on storage.objects;
create policy "Users can delete their own files"
on storage.objects for delete
using (
  bucket_id = 'InsightsLM' and
  (storage.foldername(name))[1] = auth.uid()::text
);
