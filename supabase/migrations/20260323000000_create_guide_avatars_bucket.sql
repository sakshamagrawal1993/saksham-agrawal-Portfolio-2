insert into storage.buckets (id, name, public) 
values ('guide-avatars', 'guide-avatars', true)
on conflict (id) do nothing;

create policy "Guide avatars are publicly accessible" 
  on storage.objects for select 
  using (bucket_id = 'guide-avatars');

create policy "Anyone can upload guide avatars" 
  on storage.objects for insert 
  with check (bucket_id = 'guide-avatars');

create policy "Anyone can update guide avatars" 
  on storage.objects for update 
  using (bucket_id = 'guide-avatars');
