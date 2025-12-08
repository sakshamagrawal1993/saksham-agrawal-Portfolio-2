-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- 1. PROFILES (Extends Auth)
create table if not exists public.profiles (
  id uuid references auth.users on delete cascade primary key,
  full_name text,
  avatar_url text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- RLS for profiles
alter table public.profiles enable row level security;
create policy "Users can view their own profile" on public.profiles for select using (auth.uid() = id);
create policy "Users can update their own profile" on public.profiles for update using (auth.uid() = id);


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
create policy "Users can view their own notebooks" on public.notebooks for select using (auth.uid() = user_id);
create policy "Users can create their own notebooks" on public.notebooks for insert with check (auth.uid() = user_id);
create policy "Users can update their own notebooks" on public.notebooks for update using (auth.uid() = user_id);
create policy "Users can delete their own notebooks" on public.notebooks for delete using (auth.uid() = user_id);


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
-- Helper policy using join for ownership check
create policy "Users can manage sources of their notebooks" on public.sources
  using (exists (select 1 from public.notebooks where id = notebook_id and user_id = auth.uid()))
  with check (exists (select 1 from public.notebooks where id = notebook_id and user_id = auth.uid()));


-- 4. CHAT HISTORY
create table if not exists public.chat_sessions (
  id uuid default gen_random_uuid() primary key,
  notebook_id uuid references public.notebooks(id) on delete cascade not null,
  title text, 
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.chat_sessions enable row level security;
create policy "Users can manage chat sessions of their notebooks" on public.chat_sessions
  using (exists (select 1 from public.notebooks where id = notebook_id and user_id = auth.uid()))
  with check (exists (select 1 from public.notebooks where id = notebook_id and user_id = auth.uid()));


create table if not exists public.chat_messages (
  id uuid default gen_random_uuid() primary key,
  session_id uuid references public.chat_sessions(id) on delete cascade not null,
  role text check (role in ('user', 'assistant')),
  content text not null,
  citations jsonb, 
  created_at timestamptz default now()
);

alter table public.chat_messages enable row level security;
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
create policy "Users can manage artifacts of their notebooks" on public.studio_artifacts
  using (exists (select 1 from public.notebooks where id = notebook_id and user_id = auth.uid()))
  with check (exists (select 1 from public.notebooks where id = notebook_id and user_id = auth.uid()));

-- STORAGE BUCKETS (Note: Storage policies usually need to be set in API/Dashboard for storage.objects, but buckets can be inserted)
insert into storage.buckets (id, name, public) 
values ('source_documents', 'source_documents', false)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public) 
values ('generated_media', 'generated_media', false)
on conflict (id) do nothing;
