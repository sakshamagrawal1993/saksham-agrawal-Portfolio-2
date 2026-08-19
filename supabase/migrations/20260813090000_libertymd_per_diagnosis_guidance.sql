-- P5-GUIDE — per-diagnosis guidance, computed off the report critical path.
--
-- The report keeps exactly one consultation-level `assessment_and_plan`
-- (Recommended Action Plan). This adds a SECOND, separate artifact: one
-- guidance block per differential, produced by the dedicated
-- `libertymd-diagnosis-guidance` n8n workflow (id tyzFHJu7lHgRIB2s) AFTER the
-- report row is written and served.
--
-- Four guidance surfaces total on a finished report:
--   1. assessment_and_plan   — consultation-level, unchanged, sync with report
--   2..4. diagnosis_guidance — one per differential, async, hydrated later
--
-- Storage lives on the report, not the consultation, because guidance is a
-- property of the *reported* differential set: regenerating a report produces a
-- new differential list and must invalidate the guidance that described the old
-- one. Cascade delete and the existing retention sweep therefore apply for free.
--
-- Additive and inert while LIBERTYMD_DIAGNOSIS_GUIDANCE is off: nothing writes
-- or reads these columns until the flag flips, so this is safe to apply ahead
-- of the feature.

alter table public.libertymd_reports
  add column if not exists diagnosis_guidance jsonb not null default '[]'::jsonb,
  add column if not exists diagnosis_guidance_status text not null default 'idle',
  add column if not exists diagnosis_guidance_updated_at timestamptz;

-- Shape guard: an array of entries, never an object or a scalar. Mirrors the
-- working_differential check on libertymd_consultations.
alter table public.libertymd_reports
  drop constraint if exists libertymd_reports_diagnosis_guidance_check;
alter table public.libertymd_reports
  add constraint libertymd_reports_diagnosis_guidance_check
  check (jsonb_typeof(diagnosis_guidance) = 'array');

-- A closed set of states. 'failed' is deliberately terminal-but-harmless: the
-- report still renders, the cards just never gain guidance.
alter table public.libertymd_reports
  drop constraint if exists libertymd_reports_diagnosis_guidance_status_check;
alter table public.libertymd_reports
  add constraint libertymd_reports_diagnosis_guidance_status_check
  check (diagnosis_guidance_status in ('idle', 'pending', 'ready', 'failed'));

comment on column public.libertymd_reports.diagnosis_guidance is
  'P5-GUIDE. Per-differential guidance: [{full_name, supportive_treatment[], symptomatic_treatment[], further_investigations[]}]. full_name is canonical clinical English and is the join key onto report_data.differential_diagnosis — it is never rendered. Bullets are already locale-resolved and dosing-stripped by the workflow. Never replaces report_data.assessment_and_plan.';
comment on column public.libertymd_reports.diagnosis_guidance_status is
  'P5-GUIDE. idle = never requested; pending = workflow dispatched, client should keep polling; ready = at least one matched block stored; failed = give up, render the report without guidance. The client polls only while pending.';
comment on column public.libertymd_reports.diagnosis_guidance_updated_at is
  'P5-GUIDE. Wall-clock of the last guidance state transition. Drives the client poll timeout and the stale-pending retry.';

-- The only query pattern is "reports still waiting on guidance", for the poll
-- and for any sweep of runs that were dispatched but never landed.
create index if not exists libertymd_reports_guidance_pending_idx
  on public.libertymd_reports (diagnosis_guidance_updated_at)
  where diagnosis_guidance_status = 'pending';
