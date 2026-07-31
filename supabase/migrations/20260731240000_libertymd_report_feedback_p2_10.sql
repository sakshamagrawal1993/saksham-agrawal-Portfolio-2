-- P2-10 — report feedback store (H1 instrument).
-- One row per consultation. Proxy service-role write only.
-- Free-text comment stays clinical — never Mixpanel / product_events props.
-- Does not alter libertymd_reports clinical columns (P2-07 insert-once).

create table if not exists public.libertymd_report_feedback (
  id uuid primary key default gen_random_uuid(),
  consultation_id uuid not null unique references public.libertymd_consultations(id) on delete cascade,
  user_id uuid not null,
  helpful boolean not null,
  comment text,
  created_at timestamptz not null default now(),
  constraint libertymd_report_feedback_comment_len
    check (comment is null or char_length(comment) <= 500)
);

create index if not exists libertymd_report_feedback_user_idx
  on public.libertymd_report_feedback(user_id, created_at desc);

comment on table public.libertymd_report_feedback is
  'P2-10: one-tap report helpfulness + optional free text. Join via consultation_id → consultations.turn_count + reports.triage_tier. Proxy write only.';

alter table public.libertymd_report_feedback enable row level security;

-- No anon/authenticated policies: clients never read/write this table directly.
-- Proxy uses service_role (bypasses RLS). Explicit revoke of DML from client roles.

revoke all on table public.libertymd_report_feedback from public, anon, authenticated;
grant select, insert, update, delete on table public.libertymd_report_feedback to service_role;
