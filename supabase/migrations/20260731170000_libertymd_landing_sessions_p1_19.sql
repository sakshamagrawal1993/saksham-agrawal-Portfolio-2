-- P1-19 · libertymd_landing_sessions (session-keyed attribution ledger)
--
-- Hard rules:
--   - Proxy / service_role is the sole writer (and sole reader for clients).
--   - Session-keyed via anon_session_key + opaque id — never person-keyed (no user_id).
--   - Never store raw search query / q= / free-text symptom query.
--   - keyword_id / matched_topic_slug are opaque IDs/slugs only.
-- Retention: retention_expires_at is a readiness stub.
--   P1-23 must delete expired / orphan landing rows (do not schedule cron here).

create table if not exists public.libertymd_landing_sessions (
  id uuid primary key default gen_random_uuid(),
  anon_session_key text not null,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  utm_content text,
  keyword_id text,
  matched_topic_slug text,
  locale text,
  device_class text,
  landing_path text,
  created_at timestamptz not null default now(),
  retention_expires_at timestamptz
);

comment on table public.libertymd_landing_sessions is
  'P1-19 session-keyed campaign attribution. Proxy/service_role only. Never store raw search query. No user_id — not person-keyed. P1-23 deletes expired/orphan rows.';

comment on column public.libertymd_landing_sessions.anon_session_key is
  'Opaque LibertyMD sessionStorage UUID. Session identity only — never auth.users / email / Mixpanel People key.';

comment on column public.libertymd_landing_sessions.keyword_id is
  'Allow-listed opaque campaign keyword ID from URL. Never derived from raw q= / free-text search.';

comment on column public.libertymd_landing_sessions.matched_topic_slug is
  'Allow-listed topic slug from URL (topic / matched_topic_slug). Never free-text symptom prose.';

comment on column public.libertymd_landing_sessions.retention_expires_at is
  'Default insert = now() + 30 days (anon consult window mirror). P1-23 must delete expired/orphan landing rows — no cron in P1-19.';

create unique index if not exists libertymd_landing_sessions_anon_session_key_uidx
  on public.libertymd_landing_sessions (anon_session_key);

create index if not exists libertymd_landing_sessions_utm_campaign_idx
  on public.libertymd_landing_sessions (utm_campaign);

create index if not exists libertymd_landing_sessions_keyword_id_idx
  on public.libertymd_landing_sessions (keyword_id);

create index if not exists libertymd_landing_sessions_retention_idx
  on public.libertymd_landing_sessions (retention_expires_at)
  where retention_expires_at is not null;

-- Nullable consult FK. ON DELETE SET NULL so P1-23 can remove orphan landings without deleting consults.
alter table public.libertymd_consultations
  add column if not exists landing_session_id uuid
  references public.libertymd_landing_sessions (id) on delete set null;

comment on column public.libertymd_consultations.landing_session_id is
  'P1-19 nullable FK to libertymd_landing_sessions. Direct visits / missing attribution remain NULL without error.';

create index if not exists libertymd_consultations_landing_session_id_idx
  on public.libertymd_consultations (landing_session_id)
  where landing_session_id is not null;

-- Q6(A): RLS on; zero client policies; revoke ALL (DML + SELECT) from anon/authenticated.
-- service_role bypasses RLS and remains the sole writer via libertymd-care-proxy.
alter table public.libertymd_landing_sessions enable row level security;

revoke all on table public.libertymd_landing_sessions from anon, authenticated;
revoke all on table public.libertymd_landing_sessions from public;
