-- LibertyMD physician-review reports: confidence labels uncertainty but does
-- not suppress the final report. Keep legacy values for existing rows while
-- adding the new terminal reasons written by the care proxy.

alter table public.libertymd_consultations
  drop constraint if exists libertymd_consultations_resolution_reason_check;

alter table public.libertymd_consultations
  add constraint libertymd_consultations_resolution_reason_check
  check (
    resolution_reason is null
    or resolution_reason in (
      'high_confidence',
      'workflow_ready',
      'turn_limit_confident',
      'turn_limit_report',
      'low_diagnostic_confidence',
      'insufficient_clinical_information',
      'no_health_information'
    )
  );

comment on column public.libertymd_consultations.resolution_reason is
  'Why the consultation ended. turn_limit_report includes low-confidence physician-review reports; no_health_information is the only incomplete-report reason.';
