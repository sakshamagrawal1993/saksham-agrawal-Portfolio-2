-- Deterministic quality signals used to prevent low-evidence or off-topic reports.

alter table public.libertymd_consultations
  add column if not exists non_clinical_response_count smallint not null default 0,
  add column if not exists consecutive_non_clinical_response_count smallint not null default 0,
  add column if not exists clinical_evidence_score smallint not null default 0,
  add column if not exists resolution_reason text;

alter table public.libertymd_consultations
  drop constraint if exists libertymd_consultations_non_clinical_response_count_check;

alter table public.libertymd_consultations
  add constraint libertymd_consultations_non_clinical_response_count_check
  check (non_clinical_response_count between 0 and 15);

alter table public.libertymd_consultations
  drop constraint if exists libertymd_consultations_consecutive_non_clinical_response_count_check;

alter table public.libertymd_consultations
  add constraint libertymd_consultations_consecutive_non_clinical_response_count_check
  check (consecutive_non_clinical_response_count between 0 and 15);

alter table public.libertymd_consultations
  drop constraint if exists libertymd_consultations_clinical_evidence_score_check;

alter table public.libertymd_consultations
  add constraint libertymd_consultations_clinical_evidence_score_check
  check (clinical_evidence_score between 0 and 100);

alter table public.libertymd_consultations
  drop constraint if exists libertymd_consultations_resolution_reason_check;

alter table public.libertymd_consultations
  add constraint libertymd_consultations_resolution_reason_check
  check (
    resolution_reason is null or resolution_reason in (
      'high_confidence',
      'workflow_ready',
      'turn_limit_confident',
      'low_diagnostic_confidence',
      'insufficient_clinical_information'
    )
  );

create index if not exists libertymd_consultations_resolution_reason_idx
  on public.libertymd_consultations (resolution_reason, updated_at desc)
  where resolution_reason is not null;
