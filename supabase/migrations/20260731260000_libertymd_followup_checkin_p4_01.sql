-- P4-01 — 72-hour feeling check-in ledger + unsubscribe + respond tokens.
-- Distinct from libertymd_report_delivery_tokens (P2-08). No clinical blob columns.
-- Proxy / Edge service-role write only. No marketing_consent. Never merge to profiles.email.

-- ---------------------------------------------------------------------------
-- Check-in send ledger (≤1 row per consultation)
-- ---------------------------------------------------------------------------
create table if not exists public.libertymd_followup_checkins (
  id uuid primary key default gen_random_uuid(),
  consultation_id uuid not null unique
    references public.libertymd_consultations(id) on delete cascade,
  user_id uuid,
  contact_email text not null,
  due_at timestamptz not null,
  open_until timestamptz not null,
  status text not null default 'pending'
    check (status in ('pending', 'sent', 'skipped', 'responded')),
  skip_reason text,
  sent_at timestamptz,
  answer text check (answer is null or answer in ('better', 'same', 'worse')),
  responded_at timestamptz,
  new_consultation_id uuid references public.libertymd_consultations(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint libertymd_followup_checkins_no_clinical_blob check (true)
);

comment on table public.libertymd_followup_checkins is
  'P4-01: ~72h feeling check-in ledger. No clinical slots/complaint snapshot. Address from P2-08 sent delivery token at send time.';

create index if not exists libertymd_followup_checkins_due_idx
  on public.libertymd_followup_checkins(status, due_at)
  where status = 'pending';

create index if not exists libertymd_followup_checkins_email_sent_idx
  on public.libertymd_followup_checkins(contact_email, sent_at)
  where sent_at is not null;

create index if not exists libertymd_followup_checkins_user_sent_idx
  on public.libertymd_followup_checkins(user_id, sent_at)
  where sent_at is not null and user_id is not null;

alter table public.libertymd_followup_checkins enable row level security;
revoke all on table public.libertymd_followup_checkins from public, anon, authenticated;
grant select, insert, update, delete on table public.libertymd_followup_checkins to service_role;

-- ---------------------------------------------------------------------------
-- Unsubscribe preferences (email ± user_id)
-- ---------------------------------------------------------------------------
create table if not exists public.libertymd_followup_unsubscribes (
  id uuid primary key default gen_random_uuid(),
  contact_email text,
  user_id uuid,
  unsubscribed_at timestamptz not null default now(),
  source text not null default 'one_click'
    check (source in ('one_click', 'manual')),
  constraint libertymd_followup_unsubscribes_key_present
    check (contact_email is not null or user_id is not null)
);

comment on table public.libertymd_followup_unsubscribes is
  'P4-01: immediate check-in suppression by normalized contact_email and/or user_id. ≠ marketing_consent.';

create unique index if not exists libertymd_followup_unsubscribes_email_uidx
  on public.libertymd_followup_unsubscribes(contact_email)
  where contact_email is not null;

create unique index if not exists libertymd_followup_unsubscribes_user_uidx
  on public.libertymd_followup_unsubscribes(user_id)
  where user_id is not null;

alter table public.libertymd_followup_unsubscribes enable row level security;
revoke all on table public.libertymd_followup_unsubscribes from public, anon, authenticated;
grant select, insert, update, delete on table public.libertymd_followup_unsubscribes to service_role;

-- ---------------------------------------------------------------------------
-- Respond / unsubscribe bearer tokens (≠ report redeem)
-- ---------------------------------------------------------------------------
create table if not exists public.libertymd_followup_tokens (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique,
  purpose text not null check (purpose in ('respond', 'unsubscribe')),
  checkin_id uuid not null
    references public.libertymd_followup_checkins(id) on delete cascade,
  consultation_id uuid not null
    references public.libertymd_consultations(id) on delete cascade,
  contact_email text not null,
  user_id uuid,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

comment on table public.libertymd_followup_tokens is
  'P4-01: hashed respond/unsubscribe tokens. Distinct from libertymd_report_delivery_tokens.';

create index if not exists libertymd_followup_tokens_checkin_idx
  on public.libertymd_followup_tokens(checkin_id, purpose);

alter table public.libertymd_followup_tokens enable row level security;
revoke all on table public.libertymd_followup_tokens from public, anon, authenticated;
grant select, insert, update, delete on table public.libertymd_followup_tokens to service_role;
