-- Fix storage RLS gaps after public policy hardening.
-- InsightsLM uploads use upsert:true in the client, which requires UPDATE on storage.objects.

drop policy if exists "Users can update their own files" on storage.objects;
create policy "Users can update their own files"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'InsightsLM'
  and (storage.foldername(name))[1] = (auth.uid())::text
)
with check (
  bucket_id = 'InsightsLM'
  and (storage.foldername(name))[1] = (auth.uid())::text
);
