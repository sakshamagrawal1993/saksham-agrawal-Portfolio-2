-- Migration: Add persistence types to chat_messages

-- 1. Drop the restrictive check constraint on role
alter table public.chat_messages drop constraint if exists chat_messages_role_check;

-- 2. Add 'type' column
alter table public.chat_messages add column if not exists type text default 'user_message';

-- 3. Add index for faster chronological fetching
create index if not exists idx_chat_messages_session_created on public.chat_messages(session_id, created_at);

-- 4. Create a function to get or create a unified chat session for a notebook
create or replace function public.get_or_create_chat_session(p_notebook_id uuid, p_user_id uuid)
returns uuid
language plpgsql
security definer
as $$
declare
  v_session_id uuid;
begin
  -- Try to find existing session for this notebook
  select id into v_session_id
  from public.chat_sessions
  where notebook_id = p_notebook_id
  limit 1;

  -- If not found, create one
  if v_session_id is null then
    insert into public.chat_sessions (notebook_id, title)
    values (p_notebook_id, 'General Chat')
    returning id into v_session_id;
  end if;

  return v_session_id;
end;
$$;
