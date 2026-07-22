-- Separate account identity, patient identity, encounters, and diagnostic attempts.
-- All writes continue to flow through the LibertyMD care proxy using service_role.

create table if not exists public.libertymd_patients (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  relationship text not null default 'self' check (relationship in ('self', 'dependent', 'other')),
  display_label text,
  age smallint check (age between 0 and 120),
  sex_at_birth text check (sex_at_birth in ('female', 'male', 'intersex', 'prefer_not_to_say')),
  gender_identity text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists libertymd_patients_owner_self_idx
  on public.libertymd_patients(owner_user_id)
  where relationship = 'self';

create index if not exists libertymd_patients_owner_active_idx
  on public.libertymd_patients(owner_user_id, is_active, updated_at desc);

drop trigger if exists libertymd_patients_updated_at on public.libertymd_patients;
create trigger libertymd_patients_updated_at
before update on public.libertymd_patients
for each row execute function public.libertymd_set_updated_at();

insert into public.libertymd_patients (
  owner_user_id,
  relationship,
  display_label,
  age,
  sex_at_birth
)
select
  p.user_id,
  'self',
  coalesce(nullif(p.display_name, ''), 'Me'),
  p.age,
  p.sex_at_birth
from public.libertymd_profiles p
on conflict (owner_user_id) where relationship = 'self'
do update set
  display_label = coalesce(excluded.display_label, public.libertymd_patients.display_label),
  age = coalesce(excluded.age, public.libertymd_patients.age),
  sex_at_birth = coalesce(excluded.sex_at_birth, public.libertymd_patients.sex_at_birth);

create or replace function public.libertymd_ensure_self_patient(p_user_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  patient_id uuid;
begin
  select p.id into patient_id
  from public.libertymd_patients p
  where p.owner_user_id = p_user_id and p.relationship = 'self'
  limit 1;

  if patient_id is null then
    insert into public.libertymd_patients (
      owner_user_id,
      relationship,
      display_label,
      age,
      sex_at_birth
    )
    select
      p_user_id,
      'self',
      coalesce(nullif(profile.display_name, ''), 'Me'),
      profile.age,
      profile.sex_at_birth
    from (select 1) seed
    left join public.libertymd_profiles profile on profile.user_id = p_user_id
    on conflict (owner_user_id) where relationship = 'self'
    do update set owner_user_id = excluded.owner_user_id
    returning id into patient_id;
  end if;

  return patient_id;
end;
$$;

alter table public.libertymd_consultations
  add column if not exists patient_id uuid references public.libertymd_patients(id) on delete restrict,
  add column if not exists patient_snapshot jsonb not null default '{}'::jsonb
    check (jsonb_typeof(patient_snapshot) = 'object');

update public.libertymd_consultations c
set patient_id = public.libertymd_ensure_self_patient(c.user_id)
where c.patient_id is null;

update public.libertymd_consultations c
set patient_snapshot = jsonb_strip_nulls(jsonb_build_object(
  'patient_id', patient.id,
  'relationship', patient.relationship,
  'age', coalesce((c.filled_slots ->> 'age')::smallint, patient.age),
  'sex_at_birth', coalesce(c.filled_slots ->> 'sex_at_birth', patient.sex_at_birth)
))
from public.libertymd_patients patient
where c.patient_id = patient.id and c.patient_snapshot = '{}'::jsonb;

alter table public.libertymd_consultations
  alter column patient_id set not null;

create index if not exists libertymd_consultations_patient_activity_idx
  on public.libertymd_consultations(patient_id, last_activity_at desc);

create or replace function public.libertymd_default_consultation_patient()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  patient_row public.libertymd_patients%rowtype;
begin
  if new.patient_id is null then
    new.patient_id := public.libertymd_ensure_self_patient(new.user_id);
  end if;

  if new.patient_snapshot = '{}'::jsonb then
    select * into patient_row
    from public.libertymd_patients
    where id = new.patient_id and owner_user_id = new.user_id;

    if not found then
      raise exception 'Patient does not belong to consultation owner';
    end if;

    new.patient_snapshot := jsonb_strip_nulls(jsonb_build_object(
      'patient_id', patient_row.id,
      'relationship', patient_row.relationship,
      'age', patient_row.age,
      'sex_at_birth', patient_row.sex_at_birth
    ));
  end if;

  return new;
end;
$$;

drop trigger if exists libertymd_consultation_patient_default on public.libertymd_consultations;
create trigger libertymd_consultation_patient_default
before insert on public.libertymd_consultations
for each row execute function public.libertymd_default_consultation_patient();

create or replace function public.libertymd_sync_linked_identity()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  linked_name text;
begin
  linked_name := coalesce(
    nullif(new.raw_user_meta_data ->> 'full_name', ''),
    nullif(new.raw_user_meta_data ->> 'name', '')
  );

  update public.libertymd_profiles
  set
    display_name = coalesce(linked_name, display_name),
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
    is_anonymous = coalesce(new.is_anonymous, new.email is null),
    updated_at = now()
  where user_id = new.id;

  update public.libertymd_patients
  set display_label = coalesce(linked_name, display_label)
  where owner_user_id = new.id and relationship = 'self';

  if coalesce(new.is_anonymous, new.email is null) = false then
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

create table if not exists public.libertymd_diagnostic_runs (
  id uuid primary key default gen_random_uuid(),
  consultation_id uuid not null references public.libertymd_consultations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  patient_id uuid not null references public.libertymd_patients(id) on delete restrict,
  turn_count integer not null check (turn_count >= 0),
  run_status text not null check (run_status in ('validated', 'withheld', 'error')),
  clinical_summary jsonb not null default '{}'::jsonb check (jsonb_typeof(clinical_summary) = 'object'),
  clinical_reasoning jsonb not null default '{}'::jsonb check (jsonb_typeof(clinical_reasoning) = 'object'),
  differential_diagnosis jsonb not null default '[]'::jsonb check (jsonb_typeof(differential_diagnosis) = 'array'),
  input_snapshot jsonb not null default '{}'::jsonb check (jsonb_typeof(input_snapshot) = 'object'),
  confidence_score numeric(5,2) not null default 0 check (confidence_score between 0 and 100),
  evidence_score smallint not null default 0 check (evidence_score between 0 and 100),
  validation_reason text,
  workflow_metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(workflow_metadata) = 'object'),
  created_at timestamptz not null default now()
);

create index if not exists libertymd_diagnostic_runs_consultation_idx
  on public.libertymd_diagnostic_runs(consultation_id, turn_count desc, created_at desc);
create index if not exists libertymd_diagnostic_runs_user_idx
  on public.libertymd_diagnostic_runs(user_id, created_at desc);

alter table public.libertymd_reports
  add column if not exists final_diagnostic_run_id uuid references public.libertymd_diagnostic_runs(id) on delete set null;

create table if not exists public.libertymd_identity_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  consultation_id uuid references public.libertymd_consultations(id) on delete set null,
  event_type text not null check (event_type in (
    'anonymous_profile_created',
    'google_link_started',
    'google_link_completed',
    'google_link_cancelled',
    'google_link_conflict',
    'account_merge_started',
    'account_merge_completed',
    'account_merge_failed'
  )),
  provider text,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now()
);

create index if not exists libertymd_identity_events_user_idx
  on public.libertymd_identity_events(user_id, created_at desc);

create table if not exists public.libertymd_account_merges (
  id uuid primary key default gen_random_uuid(),
  source_user_id uuid not null,
  target_user_id uuid references auth.users(id) on delete set null,
  consultation_id uuid references public.libertymd_consultations(id) on delete set null,
  transfer_token_hash text not null unique,
  status text not null default 'prepared' check (status in ('prepared', 'completed', 'expired', 'failed')),
  expires_at timestamptz not null,
  completed_at timestamptz,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now()
);

create index if not exists libertymd_account_merges_source_idx
  on public.libertymd_account_merges(source_user_id, created_at desc);
create index if not exists libertymd_account_merges_target_idx
  on public.libertymd_account_merges(target_user_id, created_at desc);

create or replace function public.libertymd_complete_account_merge(
  p_transfer_token_hash text,
  p_target_user_id uuid
)
returns table(consultation_id uuid, source_user_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  merge_row public.libertymd_account_merges%rowtype;
  source_profile public.libertymd_profiles%rowtype;
  target_patient_id uuid;
  source_self_patient_id uuid;
begin
  select * into merge_row
  from public.libertymd_account_merges
  where transfer_token_hash = p_transfer_token_hash
  for update;

  if not found or merge_row.status <> 'prepared' then
    raise exception 'Account transfer is not available';
  end if;
  if merge_row.expires_at <= now() then
    update public.libertymd_account_merges
    set status = 'expired'
    where id = merge_row.id;
    raise exception 'Account transfer expired';
  end if;

  if merge_row.source_user_id = p_target_user_id then
    update public.libertymd_account_merges
    set status = 'completed', target_user_id = p_target_user_id, completed_at = now()
    where id = merge_row.id;
    return query select merge_row.consultation_id, merge_row.source_user_id;
    return;
  end if;

  select * into source_profile
  from public.libertymd_profiles
  where user_id = merge_row.source_user_id;

  target_patient_id := public.libertymd_ensure_self_patient(p_target_user_id);
  select id into source_self_patient_id
  from public.libertymd_patients
  where owner_user_id = merge_row.source_user_id and relationship = 'self';

  update public.libertymd_profiles target
  set
    display_name = coalesce(target.display_name, source_profile.display_name),
    email = coalesce(target.email, source_profile.email),
    avatar_url = coalesce(target.avatar_url, source_profile.avatar_url),
    age = coalesce(target.age, source_profile.age),
    sex_at_birth = coalesce(target.sex_at_birth, source_profile.sex_at_birth),
    consent_version = coalesce(target.consent_version, source_profile.consent_version),
    consented_at = coalesce(target.consented_at, source_profile.consented_at),
    is_anonymous = false
  where target.user_id = p_target_user_id;

  update public.libertymd_patients target
  set
    age = coalesce(target.age, source_patient.age),
    sex_at_birth = coalesce(target.sex_at_birth, source_patient.sex_at_birth)
  from public.libertymd_patients source_patient
  where target.id = target_patient_id and source_patient.id = source_self_patient_id;

  update public.libertymd_consultations
  set
    user_id = p_target_user_id,
    patient_id = case when patient_id = source_self_patient_id then target_patient_id else patient_id end,
    patient_snapshot = case
      when patient_id = source_self_patient_id then patient_snapshot || jsonb_build_object('patient_id', target_patient_id)
      else patient_snapshot
    end
  where user_id = merge_row.source_user_id;

  update public.libertymd_reports
  set user_id = p_target_user_id
  where user_id = merge_row.source_user_id;

  update public.libertymd_safety_events
  set user_id = p_target_user_id
  where user_id = merge_row.source_user_id;

  update public.libertymd_diagnostic_runs
  set
    user_id = p_target_user_id,
    patient_id = case when patient_id = source_self_patient_id then target_patient_id else patient_id end
  where user_id = merge_row.source_user_id;

  update public.libertymd_identity_events
  set user_id = p_target_user_id
  where user_id = merge_row.source_user_id;

  update public.libertymd_consent_events
  set
    user_id = p_target_user_id,
    patient_id = case when patient_id = source_self_patient_id then target_patient_id else patient_id end
  where user_id = merge_row.source_user_id;

  update public.libertymd_product_events
  set user_id = p_target_user_id
  where user_id = merge_row.source_user_id;

  update public.libertymd_patients
  set owner_user_id = p_target_user_id
  where owner_user_id = merge_row.source_user_id and relationship <> 'self';

  delete from public.libertymd_patients
  where id = source_self_patient_id;
  delete from public.libertymd_profiles
  where user_id = merge_row.source_user_id;

  update public.libertymd_account_merges
  set status = 'completed', target_user_id = p_target_user_id, completed_at = now()
  where id = merge_row.id;

  insert into public.libertymd_identity_events (
    user_id,
    consultation_id,
    event_type,
    provider,
    metadata
  ) values (
    p_target_user_id,
    merge_row.consultation_id,
    'account_merge_completed',
    'google',
    jsonb_build_object('source_user_id', merge_row.source_user_id)
  );

  return query select merge_row.consultation_id, merge_row.source_user_id;
end;
$$;

create table if not exists public.libertymd_consent_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  patient_id uuid references public.libertymd_patients(id) on delete set null,
  consultation_id uuid references public.libertymd_consultations(id) on delete set null,
  consent_type text not null check (consent_type in ('terms_of_service', 'privacy_policy', 'ai_care_disclosure')),
  consent_version text not null,
  decision text not null check (decision in ('accepted', 'declined', 'withdrawn')),
  source text not null default 'care_intake',
  created_at timestamptz not null default now()
);

create index if not exists libertymd_consent_events_user_idx
  on public.libertymd_consent_events(user_id, created_at desc);

create table if not exists public.libertymd_product_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  consultation_id uuid references public.libertymd_consultations(id) on delete set null,
  event_name text not null check (event_name in (
    'homepage_bootstrapped',
    'consultation_started',
    'demographics_saved',
    'emergency_stopped',
    'clinical_review_needed',
    'report_gate_reached',
    'report_released_guest',
    'report_saved_google'
  )),
  properties jsonb not null default '{}'::jsonb check (jsonb_typeof(properties) = 'object'),
  created_at timestamptz not null default now()
);

comment on column public.libertymd_product_events.properties is
  'Operational metadata only. Never store symptom, transcript, diagnosis, report, email, or name content here.';

create index if not exists libertymd_product_events_user_idx
  on public.libertymd_product_events(user_id, created_at desc);
create index if not exists libertymd_product_events_name_idx
  on public.libertymd_product_events(event_name, created_at desc);

alter table public.libertymd_patients enable row level security;
alter table public.libertymd_diagnostic_runs enable row level security;
alter table public.libertymd_identity_events enable row level security;
alter table public.libertymd_account_merges enable row level security;
alter table public.libertymd_consent_events enable row level security;
alter table public.libertymd_product_events enable row level security;

create policy "LibertyMD users read own patients"
  on public.libertymd_patients for select to authenticated
  using (owner_user_id = auth.uid());

create policy "LibertyMD users read own diagnostic runs"
  on public.libertymd_diagnostic_runs for select to authenticated
  using (user_id = auth.uid());

create policy "LibertyMD users read own identity events"
  on public.libertymd_identity_events for select to authenticated
  using (user_id = auth.uid());

create policy "LibertyMD users read own account merges"
  on public.libertymd_account_merges for select to authenticated
  using (source_user_id = auth.uid() or target_user_id = auth.uid());

create policy "LibertyMD users read own consent events"
  on public.libertymd_consent_events for select to authenticated
  using (user_id = auth.uid());

create policy "LibertyMD users read own product events"
  on public.libertymd_product_events for select to authenticated
  using (user_id = auth.uid());

grant select on table
  public.libertymd_patients,
  public.libertymd_diagnostic_runs,
  public.libertymd_identity_events,
  public.libertymd_account_merges,
  public.libertymd_consent_events,
  public.libertymd_product_events
to authenticated;

revoke insert, update, delete, truncate, references, trigger on table
  public.libertymd_patients,
  public.libertymd_diagnostic_runs,
  public.libertymd_identity_events,
  public.libertymd_account_merges,
  public.libertymd_consent_events,
  public.libertymd_product_events
from authenticated, anon;

revoke all on function public.libertymd_ensure_self_patient(uuid) from public, anon, authenticated;
revoke all on function public.libertymd_default_consultation_patient() from public, anon, authenticated;
revoke all on function public.libertymd_complete_account_merge(text, uuid) from public, anon, authenticated;
grant execute on function public.libertymd_ensure_self_patient(uuid) to service_role;
grant execute on function public.libertymd_complete_account_merge(text, uuid) to service_role;
