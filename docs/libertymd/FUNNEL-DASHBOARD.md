# LibertyMD Funnel Dashboard (ops pack)

**Ticket:** P1-22  
**Project:** Mixpanel `portfolio` / `3967298` (shared; DECISIONS)  
**Prefix:** `LibertyMd ` — never hand-type at call sites  
**Postgres SoT:** `libertymd_product_events` via `addProductEvent`  
**Companion SQL:** [`scripts/sql/libertymd-funnel-dashboard.sql`](../../scripts/sql/libertymd-funnel-dashboard.sql)  
**Spreadsheet (ops paste / share):** [`FUNNEL-DASHBOARD.xlsx`](./FUNNEL-DASHBOARD.xlsx) — sheets: Overview, Funnel steps, Global filters, Segments, Cohorts, Dark gaps, Reliability formula, SQL pack, Mixpanel paste checklist, Meta  
**Taxonomy SoT:** [`MIXPANEL-LEXICON.md`](./MIXPANEL-LEXICON.md)

**Engineering Done bar:** this doc + SQL pack + contracts.  
**Live Mixpanel UI saved funnels:** **DoD+ / CANNOT RUN** without dashboard access — do not FAIL QA solely for missing paste.

This is an **ops documentation pack**, not an in-app React analytics UI. CARE “Out: P1-22 dashboard UI” means no product charts inside LibertyMD — it does **not** forbid this checked-in funnel pack.

---

## Global Mixpanel filters (every funnel)

| Filter | Value | Why |
|---|---|---|
| `app_surface` | `libertymd` | Shared Mixpanel project; never merge `jivi` / other products |
| `emit_origin` | `server` where noted | Required for reliability (`turn_failed` / `turn_completed` collide with client UX / TTFT) |

Never put PHI on funnel property lists: no symptom text, slot values, exact age/sex, diagnosis names, report body, emails, names, raw scores.

---

## Cohort boundaries

| Ticket | Boundary (UTC) | Compare basis | Notes |
|---|---|---|---|
| **P1-01** unified entry | **2026-07-31** | Demographics shown vs answered (`consultation_started` / `awaiting_demographics` vs `demographics_saved`); before vs on/after date | Annotated in `docs/libertymd/COHORT-BOUNDARIES.md` (vault: Startups `tickets/DECISIONS.md`) |
| **P1-08** speculative diagnosis | **2026-07-31** | `diagnosis_attempted` props `was_speculative` / `served_from_cache` (and/or Diagnosis-stage `inference_failed`) before vs on/after | Flag default-off ⇒ **empty post-enable cohort is OK**, not a build failure |
| **P2-14** diagnosis eligibility retune | **2026-07-31** | **Completion:** distinct `consultation_id` with `report_ready` and/or consult `status ∈ {completed, report_pending_auth}`. **Validity:** `diagnosis_attempted` with `outcome = 'valid'` and/or `libertymd_diagnostic_runs.run_status = 'validated'` ∧ `is_speculative = false`. Before vs on/after deploy timestamp | Even-turn removed; floor stays 6; no new event names. Live paste = DoD+ |

---

## Segments (AC3)

| Axis | How | Honesty |
|---|---|---|
| Anon vs linked | Mixpanel / product super `is_anonymous` | Durable server axis. Optional client-only `identity_linked` is Mixpanel-only supplement — not Postgres lifecycle SoT |
| Chip vs free-text entry | `entry_type` (+ optional `chip_id`) on existing `consult_started` / `consultation_started` | **Live (P3-05)** — `chip` \| `freetext`; allow-listed opaque `chip_id` only when chip. Props absent ⇒ pre-P3-05 / legacy. Do **not** abuse `had_options`. **Turn-count baselining must not run until P3-05 is live.** |
| Sample report → start | Client Mixpanel `LibertyMd sample_report_viewed` → later `consult_started` | **Live (P3-02)** — correlate in Mixpanel only (`condition_cluster_id`, `scroll_depth_bucket`); sample CTA starts use `entry_type: 'freetext'` (not chip). Not a Postgres product_events step. |
| Cohort window | Event / consult `created_at` before vs on/after P1-01 / P1-08 / P2-14 dates | Deploy-timestamp annotation only; no runtime feature flag |

---

## Funnel 1 · Acquisition

**Question:** Are we losing people before the interview starts?

### Mixpanel ordered steps (allow-list only)

1. `LibertyMd consult_started`
2. `LibertyMd demographics_saved`
3. `LibertyMd question_served` (first interview signal)
4. `LibertyMd turn_completed` — filter **`emit_origin = 'server'`**

**Filters:** `app_surface == 'libertymd'`.

### Dark gaps (do not invent)

- `landing_viewed`, `consult_cta_clicked`, raw UTM on Mixpanel lifecycle — **reserved / dark**.
- Acquisition UTM / keyword rates live in SQL: `scripts/sql/libertymd-landing-attribution-rates.sql` + funnel pack cohort examples.
- **P3-06 mechanism live:** keyword→content mapping + allow-list persistence coerce ship; keyword rates remain dark until traffic uses matched URLs (empty boards = traffic DoD+, not Eng FAIL).

### SQL companion

Landing rates by `utm_campaign` / `keyword_id` among FK-linked consults; P1-01 before/after demographics conversion (see SQL pack).
**P3-06:** rates SQL shape unchanged; non-empty keyword_id boards wait on matched-URL traffic.

---

## Funnel 2 · Report value

**Question:** Do people who reach a report actually get it released?

### Mixpanel ordered steps (allow-list only)

1. `LibertyMd report_ready`
2. `LibertyMd report_released` (props include `method: guest|google`)

**Optional client-only step (honesty):** `LibertyMd report_section_expanded` — **client Mixpanel only** (P2-02); not a Postgres product_events lifecycle step. Do not mix into a server-only conversion rate without `emit_origin` honesty.

**Optional client-only step (honesty):** `LibertyMd report_delivery_requested` with categorical `method` (`download` for P2-09; email-link delivery for P2-08) — **client Mixpanel only**; Lexicon closed-emitting; **not** in Postgres `PRODUCT_EVENT_NAMES`. Never put address or report body in props.

**Optional client-only step (honesty):** `LibertyMd feedback_submitted` — **client Mixpanel only** (P2-10); props `helpful` + `has_comment` only — never free text. Not a Postgres product_events step; joinability via `libertymd_report_feedback` → consultation / `triage_tier` / `turn_count`.

### Dark gaps

- (report-value leave-browser / feedback Register path promoted — see optional client-only steps above)

**Filters:** `app_surface == 'libertymd'`.

---

## Funnel 3 · Doctor demand

**Question:** After a report, do we see demand signal — and by triage tier?

### Mixpanel ordered steps (allow-list only)

1. `LibertyMd report_ready`
2. `LibertyMd report_released`
3. `LibertyMd doctor_cta_viewed` (optional client honesty — P2-11; props `triage_tier`, `cta_mode`, `position`)
4. `LibertyMd doctor_cta_clicked` (optional client honesty — P2-11)
5. `LibertyMd waitlist_joined` (optional client honesty — P2-11)

**No triage breakout on Mixpanel this ticket for `report_ready`** — `report_ready` does not emit `triage_tier`. Doctor CTA events carry categorical `triage_tier`. Stretch prop on `report_ready` rejected for Done.

### Dark gaps

- Alternate invent `doctor_cta_shown` — **forbidden** (Spec/Register = `doctor_cta_viewed`). Do not list `shown` as a live step.

### SQL companion (Done SoT for triage)

`GROUP BY libertymd_reports.triage_tier` among consults with `report_ready` / release events (see SQL pack). Join reports directly — **not** via `libertymd_turn_facts` (no `triage_tier` on the view).

### Waitlist join rate (P2-12 · Required)

Postgres SoT marker `FUNNEL_CARE_INTEREST_JOIN_RATE`:

```
join_rate =
  count(distinct care_interest.consultation_id)
  / nullif(count(distinct reports.consultation_id), 0)
```

Group by `coalesce(nullif(trim(reports.triage_tier), ''), 'unknown')`. Intent rows may have null contact email — still count as joins. Mixpanel click-through = `doctor_cta_clicked / doctor_cta_viewed` by tier (P2-11 client events).
---

## Funnel 4 · Reliability

**Question:** What share of turns fail inference, by stage and error class?

### Formula (Postgres SoT)

```
reliability_fail_rate =
  count(inference_failed)
  / nullif(count(inference_failed) + count(turn_completed), 0)
```

Group by categorical `properties->>'stage'` and `properties->>'error_class'`.

### Mixpanel mirror

- Events: `LibertyMd turn_failed` / `LibertyMd turn_completed`
- **Required filter:** `emit_origin = 'server'` **and** `app_surface = 'libertymd'`
- Without `emit_origin`, client retry UX + client TTFT **collapse** reliability % (Critical residual).

Postgres event names for the same panel: `inference_failed` / `turn_completed` (no client collision in the ledger).

---

## Internal SQL pack (AC2 / AC4)

File: `scripts/sql/libertymd-funnel-dashboard.sql`

| Section | Contents |
|---|---|
| Survival | Alias / reuse P1-20 per-turn survival against `libertymd_turn_facts` |
| Stall-by-slot | Alias / reuse P1-20 last-turn stall distribution |
| Emergency by source | **AC2 named query:** `libertymd_product_events` where `event_name = 'emergency_stopped'`, group by `properties->>'source'`; denominator = distinct emergency consults / all consults in window |
| Reliability | `inference_failed / (inference_failed + turn_completed)` by stage / error_class |
| Doctor demand | Releases / report_ready joined to `reports.triage_tier` |
| Care interest join rate | P2-12: `care_interest` joins / report consults by `triage_tier` (`FUNNEL_CARE_INTEREST_JOIN_RATE`); Mixpanel click-through via P2-11 `doctor_cta_*` |
| Cohorts | P1-01 + P1-08 date-filter examples |

**Not** a thin Postgres view; **not** a turn_facts rebuild; **not** P1-23 cleanup.

Optional clinical cross-check (comment only): `libertymd_safety_events` / `turn_facts.safety_source` — **not** the named AC2 SoT.

---

## Mixpanel UI paste checklist (DoD+ / human)

Project `portfolio` (`3967298`). Never commit tokens.

1. Create four saved funnels named: `LibertyMD · Acquisition`, `LibertyMD · Report value`, `LibertyMD · Doctor demand`, `LibertyMD · Reliability`.
2. Each funnel: ordered steps from the sections above (display names with `LibertyMd ` prefix).
3. Global property filter: `app_surface` = `libertymd`.
4. Reliability (+ any step using `turn_completed` / `turn_failed`): also `emit_origin` = `server`.
5. Segment boards: `is_anonymous` true/false; date compare boards around **2026-07-31** for P1-01 and P1-08.
6. Do **not** invent undeployed Register steps (`landing_viewed`, `doctor_cta_shown`, etc.). Doctor CTA live names are `doctor_cta_viewed` / `doctor_cta_clicked` / `waitlist_joined` (P2-11).
7. Confirm Lexicon collisions table still matches dashboard filters after paste.

Live paste proof = **DoD+ / CANNOT RUN** without dashboard access.

---

## Honesty / dark-gap summary

| Desired Register step | Status |
|---|---|
| Landing viewed / CTA click | Dark — use landing_sessions SQL |
| Chip vs freetext entry | **Live (P3-05)** — `entry_type` + optional `chip_id` on `consult_started`; legacy rows without props = pre-P3-05. Ship before turn-count baselining. |
| Sample report viewed | **Live client (P3-02)** — `sample_report_viewed` (`condition_cluster_id`, `scroll_depth_bucket`); correlate with `consult_started` in Mixpanel; not Postgres product_events |
| Doctor CTA / waitlist Mixpanel | **Live client** — `doctor_cta_viewed` / `doctor_cta_clicked` / `waitlist_joined` (P2-11); not Postgres product_events; never invent `shown` |
| Waitlist join rate (Postgres) | **Live SQL** — `FUNNEL_CARE_INTEREST_JOIN_RATE` / `libertymd_care_interest` (P2-12); null-email joins count |
| Report delivery / feedback | **Live client** — `report_delivery_requested` (P2-08/09) + `feedback_submitted` (P2-10); not Postgres product_events |
| `report_ready.triage_tier` | Missing on Mixpanel — SQL `reports.triage_tier` |
| Identity linked (Postgres) | Allow-listed; Postgres emit deferred — client Mixpanel only |

---

## Related

- Spreadsheet twin: `docs/libertymd/FUNNEL-DASHBOARD.xlsx` (same four funnels + dark gaps + paste checklist)
- Lexicon taxonomy: `docs/libertymd/MIXPANEL-LEXICON.md`
- Architecture pointer: `docs/libertymd/CARE-ARCHITECTURE.md` (funnel pack ≠ in-app dashboard UI)
- Turn-facts analyses (source of survival/stall aliases): `scripts/sql/libertymd-turn-facts-analyses.sql`
- Landing rates: `scripts/sql/libertymd-landing-attribution-rates.sql`
