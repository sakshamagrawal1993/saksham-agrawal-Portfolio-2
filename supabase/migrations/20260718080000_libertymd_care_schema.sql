-- LibertyMD anonymous-first consultation schema.
-- Anonymous visitors are real Supabase Auth users, so every row has stable ownership.

create table if not exists public.libertymd_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  display_name text,
  email text,
  avatar_url text,
  age smallint check (age between 18 and 120),
  sex_at_birth text check (sex_at_birth in ('female', 'male', 'intersex', 'prefer_not_to_say')),
  identity_provider text,
  is_anonymous boolean not null default true,
  consent_version text,
  consented_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.libertymd_consultations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'awaiting_demographics' check (
    status in (
      'awaiting_demographics',
      'interviewing',
      'high_risk',
      'report_pending_auth',
      'completed',
      'emergency_stopped',
      'clinical_review_needed',
      'abandoned'
    )
  ),
  region text not null default 'US' check (region in ('US', 'EU')),
  chief_complaint text,
  turn_count integer not null default 0 check (turn_count >= 0),
  filled_slots jsonb not null default '{}'::jsonb check (jsonb_typeof(filled_slots) = 'object'),
  missing_slots text[] not null default array[]::text[],
  target_slot text,
  intermediate_diagnoses jsonb not null default '[]'::jsonb check (jsonb_typeof(intermediate_diagnoses) = 'array'),
  safety_state jsonb not null default '{}'::jsonb check (jsonb_typeof(safety_state) = 'object'),
  report_gate text not null default 'not_reached' check (
    report_gate in ('not_reached', 'withheld', 'google_linked', 'guest_released')
  ),
  workflow_versions jsonb not null default '{}'::jsonb check (jsonb_typeof(workflow_versions) = 'object'),
  last_activity_at timestamptz not null default now(),
  completed_at timestamptz,
  retention_expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.libertymd_messages (
  id uuid primary key default gen_random_uuid(),
  consultation_id uuid not null references public.libertymd_consultations(id) on delete cascade,
  sequence bigint generated always as identity,
  role text not null check (role in ('user', 'assistant', 'system')),
  message_type text not null default 'normal' check (
    message_type in ('normal', 'demographics', 'safety', 'report_gate', 'report', 'system')
  ),
  content text not null,
  options jsonb not null default '[]'::jsonb check (jsonb_typeof(options) = 'array'),
  target_slot text,
  slot_updates jsonb not null default '{}'::jsonb check (jsonb_typeof(slot_updates) = 'object'),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now()
);

create table if not exists public.libertymd_safety_events (
  id uuid primary key default gen_random_uuid(),
  consultation_id uuid not null references public.libertymd_consultations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  turn_count integer not null default 0,
  status text not null check (status in ('pass', 'high_risk_continue', 'force_end')),
  risk_level text not null check (risk_level in ('low', 'medium', 'high', 'emergency')),
  crisis_type text not null default 'none',
  care_setting text not null default 'home',
  force_end boolean not null default false,
  message text,
  red_flags text[] not null default array[]::text[],
  source text not null default 'n8n',
  raw_result jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.libertymd_reports (
  id uuid primary key default gen_random_uuid(),
  consultation_id uuid not null unique references public.libertymd_consultations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  report_data jsonb not null check (jsonb_typeof(report_data) = 'object'),
  confidence_score numeric(5,2) not null check (confidence_score > 0 and confidence_score <= 100),
  access_status text not null default 'withheld' check (
    access_status in ('withheld', 'saved', 'guest_released')
  ),
  model_metadata jsonb not null default '{}'::jsonb,
  released_at timestamptz,
  retention_expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists libertymd_consultations_user_activity_idx
  on public.libertymd_consultations(user_id, last_activity_at desc);
create index if not exists libertymd_consultations_status_idx
  on public.libertymd_consultations(status, updated_at desc);
create index if not exists libertymd_consultations_retention_idx
  on public.libertymd_consultations(retention_expires_at)
  where retention_expires_at is not null;
create index if not exists libertymd_messages_consultation_sequence_idx
  on public.libertymd_messages(consultation_id, sequence);
create index if not exists libertymd_safety_events_consultation_idx
  on public.libertymd_safety_events(consultation_id, created_at);
create index if not exists libertymd_reports_user_created_idx
  on public.libertymd_reports(user_id, created_at desc);

create or replace function public.libertymd_set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists libertymd_profiles_updated_at on public.libertymd_profiles;
create trigger libertymd_profiles_updated_at
before update on public.libertymd_profiles
for each row execute function public.libertymd_set_updated_at();

drop trigger if exists libertymd_consultations_updated_at on public.libertymd_consultations;
create trigger libertymd_consultations_updated_at
before update on public.libertymd_consultations
for each row execute function public.libertymd_set_updated_at();

drop trigger if exists libertymd_reports_updated_at on public.libertymd_reports;
create trigger libertymd_reports_updated_at
before update on public.libertymd_reports
for each row execute function public.libertymd_set_updated_at();

-- Google identity linking keeps the anonymous auth user id, so ownership never moves.
create or replace function public.libertymd_sync_linked_identity()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  update public.libertymd_profiles
  set
    display_name = coalesce(
      nullif(new.raw_user_meta_data ->> 'full_name', ''),
      nullif(new.raw_user_meta_data ->> 'name', ''),
      display_name
    ),
    email = coalesce(new.email, email),
    avatar_url = coalesce(
      nullif(new.raw_user_meta_data ->> 'avatar_url', ''),
      nullif(new.raw_user_meta_data ->> 'picture', ''),
      avatar_url
    ),
    identity_provider = coalesce(
      nullif(new.raw_app_meta_data ->> 'provider', ''),
      identity_provider
    ),
    is_anonymous = (new.email is null),
    updated_at = now()
  where user_id = new.id;

  if new.email is not null then
    update public.libertymd_consultations
    set retention_expires_at = null
    where user_id = new.id;

    update public.libertymd_reports
    set retention_expires_at = null
    where user_id = new.id;
  end if;

  return new;
end;
$$;

drop trigger if exists libertymd_on_auth_identity_updated on auth.users;
create trigger libertymd_on_auth_identity_updated
after update of email, raw_user_meta_data, raw_app_meta_data on auth.users
for each row execute function public.libertymd_sync_linked_identity();

-- Run daily from Supabase Cron or an external scheduler.
create or replace function public.cleanup_expired_libertymd_data()
returns table(deleted_consultations bigint, deleted_profiles bigint)
language plpgsql
security definer
set search_path = public
as $$
declare
  consultation_count bigint;
  profile_count bigint;
begin
  with deleted as (
    delete from public.libertymd_consultations c
    using public.libertymd_profiles p
    where c.user_id = p.user_id
      and p.is_anonymous = true
      and c.retention_expires_at is not null
      and c.retention_expires_at < now()
    returning c.id
  )
  select count(*) into consultation_count from deleted;

  with deleted as (
    delete from public.libertymd_profiles p
    where p.is_anonymous = true
      and p.updated_at < now() - interval '30 days'
      and not exists (
        select 1 from public.libertymd_consultations c where c.user_id = p.user_id
      )
    returning p.id
  )
  select count(*) into profile_count from deleted;

  return query select consultation_count, profile_count;
end;
$$;

alter table public.libertymd_profiles enable row level security;
alter table public.libertymd_consultations enable row level security;
alter table public.libertymd_messages enable row level security;
alter table public.libertymd_safety_events enable row level security;
alter table public.libertymd_reports enable row level security;

create policy "LibertyMD users read own profile"
  on public.libertymd_profiles for select to authenticated
  using (user_id = auth.uid());

create policy "LibertyMD users read own consultations"
  on public.libertymd_consultations for select to authenticated
  using (user_id = auth.uid());

create policy "LibertyMD users read own messages"
  on public.libertymd_messages for select to authenticated
  using (
    exists (
      select 1 from public.libertymd_consultations c
      where c.id = libertymd_messages.consultation_id
        and c.user_id = auth.uid()
    )
  );

create policy "LibertyMD users read own safety events"
  on public.libertymd_safety_events for select to authenticated
  using (user_id = auth.uid());

create policy "LibertyMD users read released reports"
  on public.libertymd_reports for select to authenticated
  using (user_id = auth.uid() and access_status in ('saved', 'guest_released'));

revoke all on function public.libertymd_set_updated_at() from public, anon, authenticated;
revoke all on function public.libertymd_sync_linked_identity() from public, anon, authenticated;
revoke all on function public.cleanup_expired_libertymd_data() from public, anon, authenticated;
grant execute on function public.cleanup_expired_libertymd_data() to service_role;
