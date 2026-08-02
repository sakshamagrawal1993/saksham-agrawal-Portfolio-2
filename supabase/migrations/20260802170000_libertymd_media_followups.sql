-- LibertyMD media evidence follow-up questions.
--
-- Questions are generated only after a photo/lab analysis succeeds. They are
-- served inside the normal chat transcript, but stay linked to the originating
-- evidence so report generation can wait for them and diagnosis inputs can
-- include their answers with provenance.

create table if not exists public.libertymd_media_followups (
  id uuid primary key default gen_random_uuid(),
  consultation_id uuid not null
    references public.libertymd_consultations(id) on delete cascade,
  user_id uuid not null
    references auth.users(id) on delete cascade,
  patient_id uuid not null
    references public.libertymd_patients(id),
  evidence_kind text not null
    check (evidence_kind in ('photo', 'lab')),
  evidence_object_uuid uuid not null,
  question_order smallint not null
    check (question_order between 1 and 2),
  question_text text not null
    check (char_length(question_text) between 1 and 300),
  status text not null default 'pending'
    check (status in ('pending', 'asked', 'answered', 'waived')),
  answer_text text,
  asked_turn integer,
  answered_turn integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (consultation_id, evidence_kind, evidence_object_uuid, question_order),
  check (answer_text is null or char_length(answer_text) <= 4000),
  check (asked_turn is null or asked_turn >= 0),
  check (answered_turn is null or answered_turn >= 0)
);

create index if not exists libertymd_media_followups_next_idx
  on public.libertymd_media_followups (consultation_id, status, question_order, created_at);

comment on table public.libertymd_media_followups is
  'One or two evidence-specific questions per processed LibertyMD photo/lab report. Service-role proxy only; answers are clinical data and never telemetry.';

alter table public.libertymd_media_followups enable row level security;
revoke all on table public.libertymd_media_followups from public, anon, authenticated;
grant select, insert, update, delete on table public.libertymd_media_followups to service_role;
