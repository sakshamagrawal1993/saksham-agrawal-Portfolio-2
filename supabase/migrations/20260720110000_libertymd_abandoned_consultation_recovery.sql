-- Preserve the resumable state when a LibertyMD consultation is intentionally abandoned.

alter table public.libertymd_consultations
  add column if not exists abandoned_from_status text,
  add column if not exists abandoned_at timestamptz;

alter table public.libertymd_consultations
  drop constraint if exists libertymd_consultations_abandoned_from_status_check;

alter table public.libertymd_consultations
  add constraint libertymd_consultations_abandoned_from_status_check
  check (
    abandoned_from_status is null
    or abandoned_from_status in ('awaiting_demographics', 'interviewing', 'high_risk')
  );

alter table public.libertymd_consultations
  drop constraint if exists libertymd_consultations_abandoned_metadata_status_check;

alter table public.libertymd_consultations
  add constraint libertymd_consultations_abandoned_metadata_status_check
  check (
    status = 'abandoned'
    or (abandoned_from_status is null and abandoned_at is null)
  );

comment on column public.libertymd_consultations.abandoned_from_status is
  'Last resumable state, used only to restore a patient-confirmed abandoned consultation.';

comment on column public.libertymd_consultations.abandoned_at is
  'Time the patient intentionally chose to leave this in-progress consultation.';
