-- P4-02 — “Did you see a doctor?” columns on follow-up check-in ledger.
-- Extend libertymd_followup_checkins only. No companion table. No clinical blobs.
-- No email columns. RLS remains service_role only (unchanged grants).

alter table public.libertymd_followup_checkins
  add column if not exists saw_doctor text
    check (saw_doctor is null or saw_doctor in ('yes', 'no', 'not_yet'));

alter table public.libertymd_followup_checkins
  add column if not exists report_match text
    check (report_match is null or report_match in ('yes', 'no', 'unsure'));

comment on column public.libertymd_followup_checkins.saw_doctor is
  'P4-02: categorical doctor-visit answer (yes | no | not_yet). Nullable until answered; skip leaves null.';

comment on column public.libertymd_followup_checkins.report_match is
  'P4-02: optional product-feedback match (yes | no | unsure) when saw_doctor=yes. Never clinical claim.';
