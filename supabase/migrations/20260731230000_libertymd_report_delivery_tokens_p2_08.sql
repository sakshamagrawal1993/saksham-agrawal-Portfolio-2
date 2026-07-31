-- P2-08 — minimal report delivery-token store (email-me link, not care_interest).
-- Proxy service-role write only. No marketing_consent. Not merged to profiles.email.
-- Address alone ≠ marketing consent (P2-12 principles by reference).

create table if not exists public.libertymd_report_delivery_tokens (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique,
  consultation_id uuid not null references public.libertymd_consultations(id) on delete cascade,
  report_id uuid not null references public.libertymd_reports(id) on delete cascade,
  contact_email text not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);

create index if not exists libertymd_report_delivery_tokens_consultation_idx
  on public.libertymd_report_delivery_tokens(consultation_id, created_at desc);

create index if not exists libertymd_report_delivery_tokens_expires_idx
  on public.libertymd_report_delivery_tokens(expires_at);

comment on table public.libertymd_report_delivery_tokens is
  'P2-08: hashed 24h self-email delivery tokens. Delivery contact ≠ marketing consent ≠ profiles.email. Not libertymd_care_interest.';

alter table public.libertymd_report_delivery_tokens enable row level security;

-- No anon/authenticated policies: clients never read/write this table directly.
-- Proxy uses service_role (bypasses RLS). Explicit revoke of DML from client roles.

revoke all on table public.libertymd_report_delivery_tokens from public, anon, authenticated;
grant select, insert, update, delete on table public.libertymd_report_delivery_tokens to service_role;
