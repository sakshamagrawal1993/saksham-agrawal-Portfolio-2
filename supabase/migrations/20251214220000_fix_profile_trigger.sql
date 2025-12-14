-- FIX: Missing Profile Trigger & Backfill

-- 1. Create the function to handle new user headers
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, full_name, avatar_url)
  values (
    new.id,
    new.raw_user_meta_data->>'full_name',
    new.raw_user_meta_data->>'avatar_url'
  );
  return new;
end;
$$ language plpgsql security definer;

-- 2. Create the trigger (safely dropped first to avoid duplicates if re-running)
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- 3. Backfill existing users who might be missing a profile (like the current user)
insert into public.profiles (id, full_name, avatar_url)
select 
  id, 
  raw_user_meta_data->>'full_name', 
  raw_user_meta_data->>'avatar_url'
from auth.users
on conflict (id) do nothing;
