-- P4-06 private photo retention + retryable analysis.
-- Raw photos are EXIF-stripped before this path, stored in the private
-- libertymd-care bucket, and removed by the existing P1-24 consultation cleanup.

alter table public.libertymd_photo_analyses
  add column if not exists path text,
  add column if not exists analysis_attempts integer not null default 0,
  add column if not exists last_analysis_at timestamptz,
  add column if not exists last_analysis_error_code text;

alter table public.libertymd_photo_analyses
  alter column raw_deleted_at drop not null;

alter table public.libertymd_photo_analyses
  drop constraint if exists libertymd_photo_analyses_analysis_status_check;

alter table public.libertymd_photo_analyses
  add constraint libertymd_photo_analyses_analysis_status_check
  check (analysis_status in ('pending', 'analyzed', 'unusable', 'failed'));

alter table public.libertymd_photo_analyses
  drop constraint if exists libertymd_photo_analyses_storage_state_check;

alter table public.libertymd_photo_analyses
  add constraint libertymd_photo_analyses_storage_state_check
  check (
    (path is null and raw_deleted_at is not null)
    or
    (
      path = consultation_id::text || '/photo/' || object_uuid::text
      and raw_deleted_at is null
    )
  );

alter table public.libertymd_photo_analyses
  drop constraint if exists libertymd_photo_analyses_attempts_check;

alter table public.libertymd_photo_analyses
  add constraint libertymd_photo_analyses_attempts_check
  check (analysis_attempts >= 0 and analysis_attempts <= 20);

create index if not exists libertymd_photo_analyses_retry_idx
  on public.libertymd_photo_analyses (analysis_status, updated_at)
  where path is not null and analysis_status in ('pending', 'failed');

comment on column public.libertymd_photo_analyses.path is
  'Private libertymd-care path {consultation_id}/photo/{object_uuid}. Null only for legacy zero-retention rows.';
comment on column public.libertymd_photo_analyses.raw_deleted_at is
  'Null while the private object exists. Set by cleanup/deletion when raw bytes are removed.';
comment on column public.libertymd_photo_analyses.analysis_attempts is
  'Number of bounded agent attempts. Stored raw image permits secure retry without a client re-upload.';
