# LibertyMD Mixpanel Lexicon

**Project:** `portfolio` / `3967298` (shared; DECISIONS.md)  
**Prefix:** `LibertyMd ` (central — never hand-typed at call sites)  
**Owner tickets:** P1-16 (server fan-out) · **P1-17** (client SDK + identity) · **P1-18** (Session Replay / clinical autocapture privacy)  
**Postgres SoT:** `libertymd_product_events` via `addProductEvent`  
**Env (name only):**
- Server: `MIXPANEL_TOKEN` (Supabase Edge secret). Empty ⇒ no-op. Never commit values. Never use `VITE_MIXPANEL_TOKEN` in Deno.
- Client: `VITE_MIXPANEL_TOKEN` (browser). Empty ⇒ Analytics no-op.

Live Mixpanel Lexicon UI paste is **DoD+ / human**. This file is the in-repo Done bar for `:ci`.

---

# Server section (P1-16)

## Super properties (every server fan-out event)

| Key | Values / notes |
|---|---|
| `app_surface` | Always `libertymd` — never `jivi` |
| `surface` | `chat` \| `app` \| `unknown` — default `unknown` this ticket |
| `is_anonymous` | boolean from JWT context |
| `locale` | Clinical journey language only (`en` \| `es`) after P3-07 — from `consultations.language` once a consult exists; pre-consult = gated clinical candidate (path 2 → `en` even if chrome is `es`). **Not** chrome-only `es` under closed AC6 gate. Never `unknown` on post-ship server fan-out. |
| `device_class` | `unknown` (no UA fingerprinting) |
| `app_version` | config constant / `unknown` |
| `emit_origin` | Always `server` on fan-out |
| `consultation_id` | Opaque UUID when non-null |
| `distinct_id` | JWT `user.id` (track identity; not a “super” but required on `/track`) |
| `profile_count` | **Omitted** until cheap ctx cache (not P1-17 client work) |

---

## Fan-out display names

| Mixpanel display | Postgres SoT | Key properties | Notes |
|---|---|---|---|
| `LibertyMd consult_started` | `consultation_started` | `region`, supers; optional opaque `landing_session_id` when FK set (P1-19); **`entry_type`: `chip` \| `freetext`** (P3-05, always on post-ship emits); optional allow-listed **`chip_id`** when `entry_type = chip` | Remap (not naive suffix); never UTM/keyword prose; **never** chip label / message / `chief_complaint`. Props absent on a row ⇒ pre-P3-05 / legacy. **Do not draw turn-count baselines until P3-05 is live.** |
| `LibertyMd demographics_saved` | `demographics_saved` | categorical only | Default prefix rule |
| `LibertyMd emergency_stopped` | `emergency_stopped` | `turn_count`, `source` | |
| `LibertyMd clinical_review_needed` | `clinical_review_needed` | `reason`, buckets — **no raw scores** | Projection strips/buckets `evidence_score` |
| `LibertyMd report_gate_reached` | `report_gate_reached` | `confidence_bucket`, `evidence_bucket` | Operational retain |
| `LibertyMd report_released` | `report_released_guest` / `report_saved_google` | `method: guest\|google`, `access_status` | Remap + method |
| `LibertyMd report_ready` | `report_ready` | buckets, `turn_index` | |
| `LibertyMd turn_failed` | `inference_failed` | `stage`, `error_class`, `outcome?`, `emit_origin: server` | **Collision** — see below |
| `LibertyMd question_served` | `question_served` | `was_repeat`, `target_slot`, `turn_index`, `had_options` | AC2 |
| `LibertyMd turn_completed` | `turn_completed` | `turn_index`, slot id, `emit_origin: server` | **Collision** — see below; no TTFT |
| `LibertyMd guardrail_evaluated` | `guardrail_evaluated` | `status`, `risk_level`, `source`, `turn_index`, `shadow_llm_status` | AC2; sync default `disabled` |
| `LibertyMd diagnosis_attempted` | `diagnosis_attempted` | `was_speculative`, `served_from_cache`, `evidence_bucket`, `outcome`, `turn_index` | AC2; P1-08: warm → `was_speculative: true`; cache serve → both true; fresh acted-upon → `was_speculative: false` |
| `LibertyMd consult_abandoned` | `consult_abandoned` | status/turn categorical | |
| `LibertyMd consent_recorded` | `consent_recorded` | `method` categorical | |
| `LibertyMd profile_selected` | `profile_selected` | `relationship`, `selection_source` | **Live-server** (P1-03) → P1-16 fan-out. **No** competing client lifecycle emit. |

---

## Reserved / dark (no fan-out without Postgres emit)

| Display (reserved) | Postgres SoT | Status |
|---|---|---|
| `LibertyMd identity_linked` | `identity_linked` | Allow-listed; **Postgres emit still deferred** (P1-15 residual). Client Mixpanel emits separately — see Client section. |
| `LibertyMd homepage_bootstrapped` | `homepage_bootstrapped` | Allow-listed; dormant |

---

## Collisions (same display name, two meanings)

### `LibertyMd turn_failed`

| Origin | Meaning | Discriminators |
|---|---|---|
| **Server (this Lexicon)** | Inference stage failure from Postgres `inference_failed` | `emit_origin: 'server'`, `stage`, `error_class` |
| **Client (P0-10 / P1-17)** | Retry UX signal | `emit_origin: 'client'`, `retry_count`, `resolved_silently` |

Dashboards: filter `emit_origin`. Never collapse schemas.

### `LibertyMd turn_completed`

| Origin | Meaning | Discriminators |
|---|---|---|
| **Server (this Lexicon)** | Answer persisted / drop-off | `emit_origin: 'server'`; must **not** claim TTFT |
| **Client (P1-07 / P1-17)** | Client TTFT | `emit_origin: 'client'`, `latency_bucket_source: 'client_ttft'` |

### `LibertyMd identity_linked`

| Origin | Meaning | Discriminators |
|---|---|---|
| **Server** | Postgres allow-listed; **emit deferred** (P1-15 residual **open**) | — |
| **Client (P1-17)** | Durable Google-link / merge success (Mixpanel only) | `emit_origin: 'client'`, `was_merge`, `merge_outcome: 'success'`, `method: google_link\|account_merge` |

Do **not** create a silent dual Mixpanel stream. Claiming the P1-15 residual “closed” by shipping client Mixpanel alone is incorrect.

---

## PHI rules

Forbidden on Mixpanel (and Postgres product props): symptom text, slot **values**, exact age, sex, diagnosis names, report body, emails, names, raw `evidence_score` / `confidence_score`. Opaque IDs + categorical enums / §1 buckets only.

**Privacy (P1-18):** Session Replay is **disabled in code** on clinical LibertyMD surfaces (`/liberty-md` + `/liberty-md/*`); autocapture `input` is off on those paths. Dashboard is not the control plane. This note does not redesign event tables.

---

## Funnel dashboard (P1-22)

Ops funnel pack (four Mixpanel defs + SQL survival/stall/emergency/reliability + cohorts): **[`FUNNEL-DASHBOARD.md`](./FUNNEL-DASHBOARD.md)** · spreadsheet [`FUNNEL-DASHBOARD.xlsx`](./FUNNEL-DASHBOARD.xlsx) · SQL [`scripts/sql/libertymd-funnel-dashboard.sql`](../../scripts/sql/libertymd-funnel-dashboard.sql).

Allow-list-only steps; dark Register rows stay dark. Reliability Mixpanel mirror **requires** `emit_origin = 'server'`. Live Mixpanel UI paste = **DoD+ / CANNOT RUN**. This is **not** an in-app React analytics UI.

---

# Client section (P1-17)

**Wrapper:** `components/LibertyMD/libertymd-analytics.ts` → `trackLibertyMd` / `libertyMdEventName`. Call sites pass **suffix only**. Grep hand-typed `'LibertyMd '` under `components/LibertyMD` must be empty outside the wrapper module.

**Identity:** `components/LibertyMD/libertymd-mixpanel-identity.ts` — LibertyMD-scoped `identify(user.id)` **id-only** (no email). Portfolio `AuthContext` may still set People `$email` (pre-existing shared debt; not introduced by LibertyMD helpers).

**Clinical lifecycle** (`consult_started`, `question_served`, `profile_selected`, …) stays **server-side only**. Do not add competing client lifecycle tracks.

## Closed emitting client set (shipped)

| Suffix | Helper | Key properties | Notes |
|---|---|---|---|
| `app_error_shown` | `emitAppErrorShown` | `error_class`, `stage` | P0-12 |
| `turn_failed` | `emitTurnFailed` | `retry_count`, `resolved_silently`, `emit_origin: 'client'` | Collision w/ server |
| `turn_completed` | `emitTurnCompletedTtft` | `latency_bucket`, `latency_bucket_source: 'client_ttft'`, `emit_origin: 'client'` | Collision w/ server; TTFT only |
| `continuation_prompt_shown` | `emitContinuationPromptShown` | `type`, `was_in_viewport` (IntersectionObserver / geometry fallback) | P0-21 / P1-17 AC6; `type: comprehension_check` from OverlaySheet paint (P1-14) |
| `continuation_prompt_actioned` | `emitContinuationPromptActioned` | `type`, `seconds_to_action`; optional `action` (`proceed` \| `correct`) + `slot_name_count` (categorical) when `type: comprehension_check` | P0-21; P1-14 AC6 discriminator — no PHI / slot values |
| `partial_outcome_shown` | `emitPartialOutcomeShown` | `trigger` (`abandon` \| `soft_leave`), `bucket` categorical, `emit_origin: 'client'` | P1-09 paint; soft leave has no server abandon |
| `partial_outcome_engaged` | `emitPartialOutcomeEngaged` | `trigger`, `bucket`, `emit_origin: 'client'` | P1-09 Got it CTA (backdrop = shown only) |
| `profile_capability_offer_shown` | `emitProfileCapabilityOfferShown` | `source` categorical | P1-04 |
| `profile_capability_offer_cta` | `emitProfileCapabilityOfferCta` | `source` categorical | P1-04 |
| `identity_linked` | `emitIdentityLinked` | `was_merge`, `merge_outcome: 'success'`, `method`, `emit_origin: 'client'` | **Client-only** Mixpanel; Postgres residual open |
| `report_section_expanded` | `emitReportSectionExpanded` | `section` ∈ `assessment_and_plan` \| `differential` \| `soap` \| `red_flags` (expand only) | P2-02 H1; no PHI |
| `report_scroll_depth` | `emitReportScrollDepth` | `pct_bucket` ∈ `0` \| `25` \| `50` \| `75` \| `100` (once per bucket, monotonic) | P2-02 H1; no raw px / PHI |
| `sample_report_viewed` | `emitSampleReportViewed` | `condition_cluster_id` (allow-listed; v1 `uri_mundane`), `scroll_depth_bucket` ∈ `0` \| `25` \| `50` \| `75` \| `100` (open emits `0`, then monotonic), `emit_origin: 'client'` | P3-02 landing sample; **client Mixpanel only** — not on Postgres `PRODUCT_EVENT_NAMES`; no PHI / consult id / report body; do **not** overload `report_scroll_depth` |
| `report_delivery_requested` | `emitReportDeliveryRequested` | `method` ∈ `download` \| `email`, `emit_origin: 'client'` | P2-09 download / P2-08 email; **client Mixpanel only** — not in Postgres `PRODUCT_EVENT_NAMES`; no email / report body / PHI |
| `feedback_submitted` | `emitFeedbackSubmitted` | `helpful` boolean, `has_comment` boolean, `emit_origin: 'client'` | P2-10 H1; **client Mixpanel only** — never free text / comment body; not on Postgres `PRODUCT_EVENT_NAMES` |
| `doctor_cta_viewed` | `emitDoctorCtaViewed` | `triage_tier`, `cta_mode` (`waitlist` \| `booking`), `position` (`footer` \| `card`), `emit_origin: 'client'` | P2-11 H4; once per report session per `position`; **never** invent `doctor_cta_shown`; not on Postgres `PRODUCT_EVENT_NAMES` |
| `doctor_cta_clicked` | `emitDoctorCtaClicked` | `triage_tier`, `cta_mode`, `position`, `emit_origin: 'client'` | P2-11 H4; same names in both modes |
| `waitlist_joined` | `emitWaitlistJoined` | `triage_tier`, `cta_mode`, `position`, `emit_origin: 'client'` | P2-11 H4; never email / contact in props; durable write = P2-12 |
| `clinical_locale_blocked` | `emitClinicalLocaleBlocked` | `candidate` (`es`), `clinical_locale` (`en`\|`es`), `locale` (clinical) | P3-07 Q1; Spanish selected while AC6 gate keeps clinical `en`; key/locale only — no PHI |
| `followup_responded` | `emitFollowupResponded` | Fire 1: `answer` ∈ `better` \| `same` \| `worse`, `emit_origin: 'client'`. Fire 2 (doctor answer only): same + categorical `saw_doctor` ∈ `yes` \| `no` \| `not_yet` + optional `report_match` ∈ `yes` \| `no` \| `unsure` when answered | P4-01/P4-02; **client Mixpanel only** — not in Postgres `PRODUCT_EVENT_NAMES`; no email / complaint / PHI / triage free-text. **≤2 client fires per check-in**; no new event suffix. Skip doctor → no second fire. `report_match` = product feedback, never clinical claim |

## Reserved / dark Register client names (no invent-UI this ticket)

Landing viewed / CTA click Register rows remain **reserved** until owning tickets promote them. `sample_report_viewed` promoted (P3-02). Doctor CTA / waitlist promoted above (P2-11). `feedback_submitted` promoted (P2-10). `followup_responded` promoted (P4-01); categorical `saw_doctor` + `report_match` promoted (P4-02 two-fire). Do not invent undeployed surfaces solely for volume.

## Identity stitch contract

1. Mixpanel SDK `$device_id` via `localStorage` persistence (read `Analytics.getDeviceId` / `ensureDeviceId` only if absent).
2. After anonymous session (and on existing session boot): `identifyLibertyMdUser(supabaseUserId)` — **id-only**.
3. After successful `sync_identity` (`auth=complete`): re-identify same/linked id + `identity_linked` `{ was_merge: false, method: 'google_link', … }`.
4. After successful `complete_account_merge` (`auth=merge`): identify **surviving** id + `identity_linked` `{ was_merge: true, method: 'account_merge', … }`.
5. **Profiles are not Mixpanel users.** Never `identify(profile_id)` / patient id. Optional opaque `profile_id` + categorical `relationship` as event props only when UI already has profile context. `profile_count` remains **omitted** on server (not stolen here).
6. Do **not** call `Analytics.reset()` on merge sign-out unless a follow-up identify is guaranteed in the same tick.
7. DoD+ live check: anon consult → Google link → one Mixpanel user with prior history — **MAY BE CANNOT RUN** without live dashboard / token; mocks suffice for `:ci`.

## Multi-profile rule

A caregiver with 3 profiles ⇒ **1** Mixpanel `distinct_id` (= Supabase account `user.id`). Profile context rides as properties on UI events when known — never as person keys.
