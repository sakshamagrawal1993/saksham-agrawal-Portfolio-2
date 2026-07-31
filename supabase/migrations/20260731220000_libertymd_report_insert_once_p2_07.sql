-- P2-07 — insert-once clinical immutability for libertymd_reports.
-- Reject UPDATE of clinical body columns; allow access / retention / ownership /
-- updated_at (and generated triage_tier which tracks report_data via STORED expr
-- but is never written by the proxy).

create or replace function public.libertymd_reports_reject_clinical_update()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.report_data is distinct from old.report_data
     or new.confidence_score is distinct from old.confidence_score
     or new.final_diagnostic_run_id is distinct from old.final_diagnostic_run_id
     or new.model_metadata is distinct from old.model_metadata
  then
    raise exception 'libertymd_reports clinical columns are insert-once immutable (P2-07)'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists libertymd_reports_clinical_immutable on public.libertymd_reports;
create trigger libertymd_reports_clinical_immutable
before update on public.libertymd_reports
for each row
execute function public.libertymd_reports_reject_clinical_update();

comment on function public.libertymd_reports_reject_clinical_update() is
  'P2-07: clinical payload insert-once; access_status/released_at/retention_expires_at/user_id remain updatable.';
