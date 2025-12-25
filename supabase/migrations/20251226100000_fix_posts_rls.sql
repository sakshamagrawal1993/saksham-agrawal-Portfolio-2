-- Ensure RLS policies for posts table

alter table public.posts enable row level security;

-- Everyone can read published posts
drop policy if exists "Posts are public" on public.posts;
create policy "Posts are public" on public.posts 
for select using (true);

-- Admins can insert/update/delete
drop policy if exists "Admins can manage posts" on public.posts;
create policy "Admins can manage posts" on public.posts 
for all 
using (
  auth.role() = 'authenticated' and
  (select is_admin from public.profiles where id = auth.uid()) = true
)
with check (
  auth.role() = 'authenticated' and
  (select is_admin from public.profiles where id = auth.uid()) = true
);
