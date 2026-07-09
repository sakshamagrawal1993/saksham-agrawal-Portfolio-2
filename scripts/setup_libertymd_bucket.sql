insert into storage.buckets (id, name, public) 
values ('libertymd-assets', 'libertymd-assets', true)
on conflict (id) do update set public = true;

drop policy if exists "Public read libertymd-assets" on storage.objects;
create policy "Public read libertymd-assets"
  on storage.objects for select
  using (bucket_id = 'libertymd-assets');

drop policy if exists "Anon upload libertymd-assets" on storage.objects;
create policy "Anon upload libertymd-assets"
  on storage.objects for insert
  with check (bucket_id = 'libertymd-assets');

drop policy if exists "Anon update libertymd-assets" on storage.objects;
create policy "Anon update libertymd-assets"
  on storage.objects for update
  using (bucket_id = 'libertymd-assets');
