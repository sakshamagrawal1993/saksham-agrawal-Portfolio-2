-- P4-07 · Lab report upload attribution (proxy sole writer)
--
-- Thin table libertymd_lab_uploads: durable object-scoped patient attribution.
-- Path stays {consultation_id}/lab/{object_uuid} (P1-24) — never encode patient_id /
-- name / DOB in the Storage path. Identifiers never in queryable columns (AC4).
-- RLS on; revoke anon/authenticated DML; service_role only (feedback/care_interest posture).
-- Bucket: keep public=false; widen allowed_mime_types for PDF + lab images.
-- Never rewrite libertymd_consultations.patient_id / patient_snapshot from lab upload (Q2A).

-- ---------------------------------------------------------------------------
-- Storage MIME backstop (product max 10 MiB in proxy; bucket file_size_limit 20 MiB)
-- ---------------------------------------------------------------------------
update storage.buckets
set
  public = false,
  allowed_mime_types = array[
    'image/jpeg',
    'image/png',
    'image/webp',
    'application/pdf'
  ]::text[]
where id = 'libertymd-care';

-- ---------------------------------------------------------------------------
-- Attribution table
-- ---------------------------------------------------------------------------
create table if not exists public.libertymd_lab_uploads (
  id uuid primary key default gen_random_uuid(),
  consultation_id uuid not null
    references public.libertymd_consultations(id) on delete cascade,
  object_uuid uuid not null,
  patient_id uuid not null
    references public.libertymd_patients(id),
  path text not null,
  content_type text not null,
  analysis_status text not null default 'stub'
    check (analysis_status in (
      'stub',
      'pending_redaction',
      'redacted',
      'mapped',
      'failed'
    )),
  -- Structured analytes only: parameter_id / name / value / unit / flags / unmapped.
  -- Ban extracted patient_name / dob / date_of_birth / mrn / address / phone (AC4 / S5).
  structured_results jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (consultation_id, object_uuid)
);

create index if not exists libertymd_lab_uploads_consultation_idx
  on public.libertymd_lab_uploads (consultation_id);

create index if not exists libertymd_lab_uploads_patient_idx
  on public.libertymd_lab_uploads (patient_id);

comment on table public.libertymd_lab_uploads is
  'P4-07: Lab object attribution. Proxy service_role writer only. Object-scoped patient_id — never rebinds consult patient_id/snapshot. No identifier columns. Path = P1-24 {consultation_id}/lab/{object_uuid}.';

comment on column public.libertymd_lab_uploads.patient_id is
  'Attributed owned active profile at upload. Object-scoped only; does not UPDATE libertymd_consultations.patient_id.';

comment on column public.libertymd_lab_uploads.path is
  'Storage path under libertymd-care. Must match buildLibertyMdCarePath(..., lab, object_uuid). Never encodes name/DOB/patient_id.';

comment on column public.libertymd_lab_uploads.structured_results is
  'Taxonomy-mapped analytes (parameter_id/value/unit/flags/unmapped) + review_state. Never patient_name/dob/mrn/address/phone keys.';

comment on column public.libertymd_lab_uploads.analysis_status is
  'stub|pending_redaction|redacted|mapped|failed. Live OCR optional; stub = zero model egress this ship.';

alter table public.libertymd_lab_uploads enable row level security;

revoke all on table public.libertymd_lab_uploads from public, anon, authenticated;
grant select, insert, update, delete on table public.libertymd_lab_uploads to service_role;
