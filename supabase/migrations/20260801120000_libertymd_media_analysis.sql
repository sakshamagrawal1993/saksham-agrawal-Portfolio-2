-- LibertyMD live media analysis and zero-retention raw-file contract.
--
-- The care proxy sends validated bytes to n8n only for the duration of one
-- request. Raw photos/reports are never persisted to Storage. Durable records
-- contain the authenticated user attribution, the AI analysis, and normalized
-- lab rows only.

-- Fill three CBC percentage gaps in the shared parameter dictionary. These are
-- LibertyMD-owned stable ids (not represented as LOINC codes).
insert into public.health_parameter_definitions (id, name, category, unit)
values
  ('libertymd-cbc-eosinophils-pct', 'Eosinophils Percentage', 'Lab Report Parameter', '%'),
  ('libertymd-cbc-monocytes-pct', 'Monocytes Percentage', 'Lab Report Parameter', '%'),
  ('libertymd-cbc-basophils-pct', 'Basophils Percentage', 'Lab Report Parameter', '%')
on conflict (id) do update
set name = excluded.name,
    category = excluded.category,
    unit = excluded.unit;

-- Canonical units for the CBC definitions exercised by the closeout sample.
update public.health_parameter_definitions
set unit = case id
  when '718-7' then 'g/dL'
  when '26453-1' then '10^6/uL'
  when '4544-3' then '%'
  when '30428-7' then 'fL'
  when '28539-5' then 'pg'
  when '28540-3' then 'g/dL'
  when '30385-9' then '%'
  when '26464-8' then 'cells/uL'
  when '26505-8' then '%'
  when '26478-8' then '%'
  when '26515-7' then 'cells/uL'
  else unit
end
where id in (
  '718-7', '26453-1', '4544-3', '30428-7', '28539-5', '28540-3',
  '30385-9', '26464-8', '26505-8', '26478-8', '26515-7'
);

-- Existing upload rows are backfilled from their consultation owner. New rows
-- are created only after the workflow succeeds and contain no raw object path.
alter table public.libertymd_lab_uploads
  add column if not exists user_id uuid references auth.users(id) on delete cascade,
  add column if not exists analysis_summary jsonb not null default '{}'::jsonb,
  add column if not exists raw_deleted_at timestamptz;

update public.libertymd_lab_uploads u
set user_id = c.user_id
from public.libertymd_consultations c
where u.consultation_id = c.id
  and u.user_id is null;

alter table public.libertymd_lab_uploads
  alter column user_id set not null,
  alter column path drop not null;

create index if not exists libertymd_lab_uploads_user_idx
  on public.libertymd_lab_uploads (user_id, created_at desc);

comment on column public.libertymd_lab_uploads.path is
  'Legacy raw Storage path. Null for zero-retention analysis uploads.';
comment on column public.libertymd_lab_uploads.raw_deleted_at is
  'Set when the raw file is absent. For live analysis uploads, equals created_at because raw bytes were never persisted.';

create table if not exists public.libertymd_photo_analyses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  consultation_id uuid not null references public.libertymd_consultations(id) on delete cascade,
  patient_id uuid not null references public.libertymd_patients(id),
  object_uuid uuid not null,
  content_type text not null check (content_type in ('image/jpeg', 'image/png', 'image/webp')),
  analysis_status text not null check (analysis_status in ('analyzed', 'unusable', 'failed')),
  analysis_data jsonb not null default '{}'::jsonb,
  raw_deleted_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (consultation_id, object_uuid)
);

create index if not exists libertymd_photo_analyses_user_idx
  on public.libertymd_photo_analyses (user_id, created_at desc);
create index if not exists libertymd_photo_analyses_patient_idx
  on public.libertymd_photo_analyses (patient_id, created_at desc);

comment on table public.libertymd_photo_analyses is
  'Observation-only photo/radiograph analyses. Raw bytes are never persisted; raw_deleted_at records that zero-retention state.';

create table if not exists public.libertymd_lab_results (
  id uuid primary key default gen_random_uuid(),
  lab_upload_id uuid not null references public.libertymd_lab_uploads(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  consultation_id uuid not null references public.libertymd_consultations(id) on delete cascade,
  patient_id uuid not null references public.libertymd_patients(id),
  parameter_id text not null references public.health_parameter_definitions(id),
  parameter_name text not null,
  raw_name text not null,
  value_text text,
  value_numeric numeric,
  raw_unit text,
  standardized_unit text,
  reference_range text,
  printed_flag text,
  range_classification text not null default 'unclassified'
    check (range_classification in ('below_range', 'within_range', 'above_range', 'borderline', 'flagged', 'unclassified')),
  analysis_text text,
  recorded_at timestamptz,
  review_state text not null default 'ai_generated_unreviewed'
    check (review_state in ('ai_generated_unreviewed', 'clinician_reviewed')),
  created_at timestamptz not null default now(),
  unique (lab_upload_id, parameter_id)
);

create index if not exists libertymd_lab_results_user_idx
  on public.libertymd_lab_results (user_id, created_at desc);
create index if not exists libertymd_lab_results_patient_parameter_idx
  on public.libertymd_lab_results (patient_id, parameter_id, created_at desc);

comment on table public.libertymd_lab_results is
  'One canonical parameter per lab upload. Explicit user_id and patient_id support user/profile history without storing the raw report.';

alter table public.libertymd_photo_analyses enable row level security;
alter table public.libertymd_lab_results enable row level security;

revoke all on table public.libertymd_photo_analyses from public, anon, authenticated;
revoke all on table public.libertymd_lab_results from public, anon, authenticated;
grant select, insert, update, delete on table public.libertymd_photo_analyses to service_role;
grant select, insert, update, delete on table public.libertymd_lab_results to service_role;
