-- Storage Policies for Journal Media

-- 1. Create the bucket
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'journal-media', 
  'journal-media', 
  true, -- Public for viewing
  52428800, -- 50MB
  '{
    "image/jpeg",
    "image/png",
    "image/gif",
    "image/webp",
    "image/svg+xml"
  }'
)
on conflict (id) do update set 
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types,
  public = EXCLUDED.public;

-- 2. Policies

-- Allow public read access (viewing images)
drop policy if exists "Public Access" on storage.objects;
create policy "Public Access"
on storage.objects for select
using ( bucket_id = 'journal-media' );

-- Allow authenticated admins to upload
drop policy if exists "Admins can upload" on storage.objects;
create policy "Admins can upload"
on storage.objects for insert
with check (
  bucket_id = 'journal-media' and
  auth.role() = 'authenticated' and
  (select is_admin from public.profiles where id = auth.uid()) = true
);

-- Allow authenticated admins to update
drop policy if exists "Admins can update" on storage.objects;
create policy "Admins can update"
on storage.objects for update
using (
  bucket_id = 'journal-media' and
  auth.role() = 'authenticated' and
  (select is_admin from public.profiles where id = auth.uid()) = true
);

-- Allow authenticated admins to delete
drop policy if exists "Admins can delete" on storage.objects;
create policy "Admins can delete"
on storage.objects for delete
using (
  bucket_id = 'journal-media' and
  auth.role() = 'authenticated' and
  (select is_admin from public.profiles where id = auth.uid()) = true
);
