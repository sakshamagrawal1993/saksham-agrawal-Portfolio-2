-- MERGE MIGRATION: InsightsLM Tables -> Ticketflow Project
-- This script adds all necessary tables for InsightsLM functionality to an existing Supabase project.

-- Enable UUID extension (likely already enabled, but good to ensure)
create extension if not exists "uuid-ossp";

-- 1. PROFILES (Extends Auth)
-- Note: Ticketflow might not have a profiles table yet, or it might rely on auth.users directly.
-- We'll create it if it doesn't exist.
create table if not exists public.profiles (
  id uuid references auth.users on delete cascade primary key,
  full_name text,
  avatar_url text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- RLS for profiles
alter table public.profiles enable row level security;
do $$ begin
  create policy "Users can view their own profile" on public.profiles for select using (auth.uid() = id);
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "Users can update their own profile" on public.profiles for update using (auth.uid() = id);
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "Users can insert their own profile" on public.profiles for insert with check (auth.uid() = id);
exception when duplicate_object then null; end $$;


-- 2. NOTEBOOKS
create table if not exists public.notebooks (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  title text not null default 'Untitled Notebook',
  emoji_icon text default '📓', 
  gradient_bg text default 'from-blue-500 to-purple-500', 
  is_featured boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- RLS for notebooks
alter table public.notebooks enable row level security;
do $$ begin
  -- Allow users to view their own notebooks OR any featured notebooks
  create policy "Users can view own or featured notebooks" on public.notebooks for select using (auth.uid() = user_id OR is_featured = true);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "Users can create their own notebooks" on public.notebooks for insert with check (auth.uid() = user_id);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "Users can update their own notebooks" on public.notebooks for update using (auth.uid() = user_id);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "Users can delete their own notebooks" on public.notebooks for delete using (auth.uid() = user_id);
exception when duplicate_object then null; end $$;


-- 3. SOURCES
do $$ begin
    create type source_type as enum ('pdf', 'website', 'youtube', 'text', 'audio_file');
exception
    when duplicate_object then null;
end $$;

create table if not exists public.sources (
  id uuid default gen_random_uuid() primary key,
  notebook_id uuid references public.notebooks(id) on delete cascade not null,
  type source_type not null,
  title text not null,
  
  -- content & storage
  source_url text, -- For websites/youtube
  storage_path text, -- For uploaded files (PDF/Audio) in Supabase Storage
  extracted_text text, -- Raw text extracted for RAG
  token_count int, 
  
  -- meta
  created_at timestamptz default now()
);

-- RLS for sources
alter table public.sources enable row level security;
do $$ begin
  create policy "Users can manage sources of their notebooks" on public.sources
    using (exists (select 1 from public.notebooks where id = notebook_id and user_id = auth.uid()))
    with check (exists (select 1 from public.notebooks where id = notebook_id and user_id = auth.uid()));
exception when duplicate_object then null; end $$;


-- 4. CHAT HISTORY
create table if not exists public.chat_sessions (
  id uuid default gen_random_uuid() primary key,
  notebook_id uuid references public.notebooks(id) on delete cascade not null,
  title text, 
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.chat_sessions enable row level security;
do $$ begin
  create policy "Users can manage chat sessions of their notebooks" on public.chat_sessions
    using (exists (select 1 from public.notebooks where id = notebook_id and user_id = auth.uid()))
    with check (exists (select 1 from public.notebooks where id = notebook_id and user_id = auth.uid()));
exception when duplicate_object then null; end $$;


create table if not exists public.chat_messages (
  id uuid default gen_random_uuid() primary key,
  session_id uuid references public.chat_sessions(id) on delete cascade not null,
  role text check (role in ('user', 'assistant')),
  content text not null,
  citations jsonb, 
  created_at timestamptz default now()
);

alter table public.chat_messages enable row level security;
do $$ begin
  create policy "Users can manage chat messages" on public.chat_messages
    using (exists (
      select 1 from public.chat_sessions s
      join public.notebooks n on s.notebook_id = n.id
      where s.id = session_id and n.user_id = auth.uid()
    ))
    with check (exists (
      select 1 from public.chat_sessions s
      join public.notebooks n on s.notebook_id = n.id
      where s.id = session_id and n.user_id = auth.uid()
    ));
exception when duplicate_object then null; end $$;


-- 5. STUDIO ARTIFACTS
do $$ begin
    create type artifact_type as enum ('audio_overview', 'mind_map', 'quiz', 'briefing_doc');
exception
    when duplicate_object then null;
end $$;

create table if not exists public.studio_artifacts (
  id uuid default gen_random_uuid() primary key,
  notebook_id uuid references public.notebooks(id) on delete cascade not null,
  type artifact_type not null,
  title text,
  
  -- output data
  media_url text, 
  data_content jsonb, 
  text_content text, 
  
  -- processing state
  status text default 'pending', 
  
  created_at timestamptz default now()
);

alter table public.studio_artifacts enable row level security;
do $$ begin
  create policy "Users can manage artifacts of their notebooks" on public.studio_artifacts
    using (exists (select 1 from public.notebooks where id = notebook_id and user_id = auth.uid()))
    with check (exists (select 1 from public.notebooks where id = notebook_id and user_id = auth.uid()));
exception when duplicate_object then null; end $$;

-- 6. TICKETFLOW TABLES
-- We include these with IF NOT EXISTS to ensure compatibility if they are already present.

-- Matches existing schema: id text, timestamps as bigint (epoch)
create table if not exists public.tickets (
  id text not null primary key, -- Changed from uuid to text per existing schema
  title text not null,
  description text,
  customer_name text, -- Added missing column
  status text not null default 'Open' check (status in ('Open', 'In Progress', 'Resolved', 'Closed')),
  created_at bigint, -- Changed from timestamp to bigint
  updated_at bigint, -- Changed from timestamp to bigint
  created_by text -- Storing email
);

-- Ticketflow RLS
alter table public.tickets enable row level security;
do $$ begin
  create policy "Allow generic access to tickets" on public.tickets for all using (true) with check (true);
exception when duplicate_object then null; end $$;


create table if not exists public.remarks (
  id text not null primary key, -- Changed from uuid to text
  ticket_id text references public.tickets(id) on delete cascade not null, -- Changed from uuid to text
  author text not null,
  text text not null,
  timestamp bigint, -- Matches existing schema name 'timestamp' and type 'bigint'
  type text -- Matches existing schema
);

alter table public.remarks enable row level security;
do $$ begin
  create policy "Allow generic access to remarks" on public.remarks for all using (true) with check (true);
exception when duplicate_object then null; end $$;


-- NEW TABLE: ticket_actions (Audit Log)
-- Must match existing tickets schema (id text, timestamps bigint)
create table if not exists public.ticket_actions (
  id uuid default gen_random_uuid() primary key,
  ticket_id text references public.tickets(id) on delete cascade not null, -- Foreign key must be TEXT
  action text not null,
  actor text not null,
  created_at bigint default (extract(epoch from now()) * 1000)::bigint -- Consistent with others
);

alter table public.ticket_actions enable row level security;
do $$ begin
  create policy "Allow generic access to ticket_actions" on public.ticket_actions for all using (true) with check (true);
exception when duplicate_object then null; end $$;

-- STORAGE BUCKETS
insert into storage.buckets (id, name, public) 
values ('source_documents', 'source_documents', false)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public) 
values ('generated_media', 'generated_media', false)
on conflict (id) do nothing;
