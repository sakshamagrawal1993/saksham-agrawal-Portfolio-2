-- P3-08 · LibertyMD clinical i18n substrate (from-scratch)
-- Sole apply path for message catalog / region_config / translation_reviews.
-- Stale draft 20260720100000_libertymd_i18n.sql is neutralized and must not
-- create tables or seed fake approvals.
--
-- Engineering `approved` ≠ clinicalReleaseGatePassed (P0-17 residual).
-- Seeds: approved EN P0-17 emergency surface only + US 911/988 (+ EU fixture).
-- Writes: service_role only (no email-owner RLS). Reads: approved catalog + region.

-- 1) consultations.language affordance (unused until P3-07) --------------------
alter table if exists public.libertymd_consultations
  add column if not exists language text not null default 'en';

do $$ begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'libertymd_consultations_language_check'
  ) then
    alter table public.libertymd_consultations
      add constraint libertymd_consultations_language_check
      check (language in ('en', 'es'));
  end if;
end $$;

-- Keep region check US | EU (do not expand paid geo here).
-- Existing constraint from core schema already enforces this.

-- 2) Message catalog -----------------------------------------------------------
create table if not exists public.libertymd_message_catalog (
  id uuid primary key default gen_random_uuid(),
  message_key text not null,
  language text not null check (language in ('en', 'es')),
  content text not null,  -- may contain {emergency_number} / {crisis_number}
  version int not null default 1,
  status text not null default 'pending_review'
    check (status in ('pending_review', 'approved', 'rejected', 'superseded')),
  source text not null default 'human',  -- 'human' | 'machine'
  reviewer_notes text,
  approved_by text,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (message_key, language, version)
);

create index if not exists libertymd_message_catalog_approved_lookup
  on public.libertymd_message_catalog (language, message_key)
  where status = 'approved';

-- 3) Region config (medical + crisis numbers) ----------------------------------
create table if not exists public.libertymd_region_config (
  region text primary key,
  emergency_number text not null,   -- medical emergency (US 911)
  crisis_number text not null,      -- crisis / SI line (US 988)
  care_setting_labels jsonb not null default '{}'::jsonb,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.libertymd_region_config (region, emergency_number, crisis_number, notes) values
  ('US', '911', '988', 'United States — medical 911 / Suicide & Crisis Lifeline 988'),
  ('EU', '112', '112', 'EU fixture for AC2 non-US number proof (not a paid-acquisition expand)')
on conflict (region) do nothing;

-- 4) Translation review ledger -------------------------------------------------
create table if not exists public.libertymd_translation_reviews (
  id uuid primary key default gen_random_uuid(),
  locale text not null check (locale in ('en', 'es')),
  bundle_version text not null,
  status text not null default 'pending_review'
    check (status in ('pending_review', 'approved', 'rejected')),
  reviewer_notes text,
  approved_by text,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  unique (locale, bundle_version)
);

insert into public.libertymd_translation_reviews (locale, bundle_version, status, approved_by, approved_at, reviewer_notes)
values (
  'en', 'p3-08-p0-17', 'approved', 'system-p3-08', now(),
  'Engineering approved EN emergency surface. REQUIRES EXPERT REVIEW for clinical release.'
)
on conflict (locale, bundle_version) do nothing;

-- es holds pending_review only — never machine-approved for production serve.
insert into public.libertymd_translation_reviews (locale, bundle_version, status, reviewer_notes)
values (
  'es', 'p3-08-pending', 'pending_review',
  'Spanish clinical bundle awaits native-speaker + clinical review (P3-07).'
)
on conflict (locale, bundle_version) do nothing;

-- 5) RLS — public/authenticated read approved catalog + region; writes via service_role only
alter table public.libertymd_message_catalog enable row level security;
alter table public.libertymd_region_config enable row level security;
alter table public.libertymd_translation_reviews enable row level security;

drop policy if exists "catalog_read_approved" on public.libertymd_message_catalog;
create policy "catalog_read_approved" on public.libertymd_message_catalog
  for select using (status = 'approved');

drop policy if exists "region_config_read" on public.libertymd_region_config;
create policy "region_config_read" on public.libertymd_region_config
  for select using (true);

-- Reviews: no anon/authenticated SELECT of pending rows; service_role bypasses RLS.
-- Intentionally no INSERT/UPDATE/DELETE policies for authenticated — service_role only.

-- 6) Seed approved EN P0-17 emergency surface (placeholders for region numbers) --
-- Omit safety.high_risk_continue / safety.clinical_review_needed (Q5).

insert into public.libertymd_message_catalog
  (message_key, language, content, status, source, approved_by, approved_at, reviewer_notes)
values
-- Shared heading
('emergency.heading', 'en',
 'For safety reasons we have been forced to end this consultation.',
 'approved', 'human', 'system-p3-08', now(),
 'REQUIRES EXPERT REVIEW before clinical release.'),

-- Standing instructions (per crisis_type / generic)
('emergency.standing.acs_chest_pain', 'en',
 'If you believe this is a medical emergency please call {emergency_number} or your local emergency services immediately. Do not drive yourself.',
 'approved', 'human', 'system-p3-08', now(), 'REQUIRES EXPERT REVIEW before clinical release.'),
('emergency.standing.stroke_fast', 'en',
 'If you believe this is a medical emergency please call {emergency_number} or your local emergency services immediately. Note when symptoms started, and do not drive yourself.',
 'approved', 'human', 'system-p3-08', now(), 'REQUIRES EXPERT REVIEW before clinical release.'),
('emergency.standing.thunderclap_headache', 'en',
 'If you believe this is a medical emergency please call {emergency_number} or your local emergency services immediately.',
 'approved', 'human', 'system-p3-08', now(), 'REQUIRES EXPERT REVIEW before clinical release.'),
('emergency.standing.anaphylaxis', 'en',
 'If you believe this is a medical emergency please call {emergency_number} or your local emergency services immediately. Use epinephrine if available.',
 'approved', 'human', 'system-p3-08', now(), 'REQUIRES EXPERT REVIEW before clinical release.'),
('emergency.standing.respiratory_distress', 'en',
 'If you believe this is a medical emergency please call {emergency_number} or your local emergency services immediately.',
 'approved', 'human', 'system-p3-08', now(), 'REQUIRES EXPERT REVIEW before clinical release.'),
('emergency.standing.surgical_abdomen', 'en',
 'If you believe this is a medical emergency please call {emergency_number} or your local emergency services immediately.',
 'approved', 'human', 'system-p3-08', now(), 'REQUIRES EXPERT REVIEW before clinical release.'),
('emergency.standing.suicidal_ideation', 'en',
 'If you are experiencing emotional distress, please call the Suicide & Crisis Lifeline at {crisis_number} or your local crisis services immediately.',
 'approved', 'human', 'system-p3-08', now(), 'REQUIRES EXPERT REVIEW: crisis-line copy and SI framing.'),
('emergency.standing.generic_medical', 'en',
 'If you believe this is a medical emergency please call {emergency_number} or your local emergency services immediately.',
 'approved', 'human', 'system-p3-08', now(), 'REQUIRES EXPERT REVIEW before clinical release.'),

-- Detail copy
('emergency.detail.acs_chest_pain', 'en',
 'These symptoms can be a cardiac emergency involving the heart. Call {emergency_number} or go to the ER now. Do not drive yourself.',
 'approved', 'human', 'system-p3-08', now(), 'REQUIRES EXPERT REVIEW before clinical release.'),
('emergency.detail.stroke_fast', 'en',
 'These symptoms may be a stroke. Call {emergency_number} now. Note when they started, and do not drive yourself.',
 'approved', 'human', 'system-p3-08', now(), 'REQUIRES EXPERT REVIEW before clinical release.'),
('emergency.detail.thunderclap_headache', 'en',
 'A sudden worst-of-life headache can be a neurological emergency. Call {emergency_number} or go to the ER now.',
 'approved', 'human', 'system-p3-08', now(), 'REQUIRES EXPERT REVIEW before clinical release.'),
('emergency.detail.anaphylaxis', 'en',
 'This may be anaphylaxis. Use epinephrine if available and call {emergency_number} immediately.',
 'approved', 'human', 'system-p3-08', now(), 'REQUIRES EXPERT REVIEW before clinical release.'),
('emergency.detail.respiratory_distress', 'en',
 'Severe breathing problems need emergency care. Call {emergency_number} or go to the ER now.',
 'approved', 'human', 'system-p3-08', now(), 'REQUIRES EXPERT REVIEW before clinical release.'),
('emergency.detail.surgical_abdomen', 'en',
 'Severe abdominal pain with these features can be a surgical emergency. Seek ER care now.',
 'approved', 'human', 'system-p3-08', now(), 'REQUIRES EXPERT REVIEW before clinical release.'),
('emergency.detail.suicidal_ideation', 'en',
 'Please call or text {crisis_number} now to reach the Suicide & Crisis Lifeline. Stay with a trusted person while you connect.',
 'approved', 'human', 'system-p3-08', now(), 'REQUIRES EXPERT REVIEW: crisis-line copy and SI framing.'),
('emergency.detail.generic_medical', 'en',
 'These symptoms may be a medical emergency. Call {emergency_number} or go to the nearest emergency department now.',
 'approved', 'human', 'system-p3-08', now(), 'REQUIRES EXPERT REVIEW before clinical release.')
on conflict (message_key, language, version) do nothing;

-- updated_at trigger (reuse core helper when present)
do $$ begin
  if exists (select 1 from pg_proc where proname = 'libertymd_set_updated_at') then
    if not exists (
      select 1 from pg_trigger where tgname = 'libertymd_message_catalog_set_updated_at'
    ) then
      create trigger libertymd_message_catalog_set_updated_at
        before update on public.libertymd_message_catalog
        for each row execute function public.libertymd_set_updated_at();
    end if;
    if not exists (
      select 1 from pg_trigger where tgname = 'libertymd_region_config_set_updated_at'
    ) then
      create trigger libertymd_region_config_set_updated_at
        before update on public.libertymd_region_config
        for each row execute function public.libertymd_set_updated_at();
    end if;
  end if;
end $$;
