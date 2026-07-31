-- P1-08 · Speculative diagnosis pre-warm
-- Distinguishes pre-warm Diagnosis rows from ordinary gate-open inserts.
-- Historical rows default false. Append-only: served cache keeps is_speculative = true.

alter table public.libertymd_diagnostic_runs
  add column if not exists is_speculative boolean not null default false;

comment on column public.libertymd_diagnostic_runs.is_speculative is
  'P1-08: true when this row originated as a detached pre-warm Diagnosis. May still be the acted-upon report source on cache serve (no flag flip).';
