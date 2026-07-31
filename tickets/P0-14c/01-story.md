# P0-14c · Log the matched span into `raw_result`

**Size/Priority:** XS · P1 (per `LibertyMD_Ticket_Specs_Phase0_Phase1.md` §6)
**Author:** Product
**Date:** 2026-07-30
**Status:** Ready for tech review

---

## Intent

The deterministic emergency screen is the only emergency path that survives an n8n outage, and right now we cannot tell *why* any of its firings happened — so we can neither audit a false positive nor prove a negation bug isn't silently suppressing a real MI.

---

## Context

All numbers below were verified directly against project `ralhkmpbslsdkwnqzqen` and the working tree on 2026-07-30.

### The gap, measured

`libertymd_safety_events` holds **98 rows** total:

| `source` | `status` | rows | rows with `raw_result = '{}'` | turn range | window (UTC) |
|---|---|---|---|---|---|
| `llm` | `pass` | 81 | 0 | 1–8 | 2026-07-18 02:50 → 2026-07-22 07:49 |
| `edge_deterministic` | `force_end` | **9** | **9** | 1–1 | 2026-07-19 15:02 → 2026-07-19 19:01 |
| `llm` | `high_risk_continue` | 5 | 0 | 3–6 | 2026-07-19 19:14 → 2026-07-20 02:53 |
| `error_fail_cautious` | `high_risk_continue` | 2 | 2 | 1–1 | 2026-07-20 07:55 → 2026-07-22 07:41 |
| `llm` | `force_end` | 1 | 0 | 6–6 | 2026-07-19 20:13 |

- **9/9** `edge_deterministic` rows have `raw_result = '{}'`. Every one is `crisis_type = 'acs_chest_pain'`, `care_setting = 'call_911'`, `turn_count = 1`, across **9 distinct `consultation_id`s**.
- The 87 `llm`-sourced rows *do* have a populated `raw_result`, but it carries exactly nine keys — `status, risk_level, crisis_type, force_end, is_emergency, care_setting, message, red_flags, source` — **none of which identify a trigger**. There is no matched span, no rule id and no pattern-set version anywhere in the table, in either lane.
- **0 rows** have `source = 'deterministic'` (the n8n-side prefilter branch has never been the recorded source, because the edge screen short-circuits before n8n is called).

### Root cause — one line

`supabase/functions/libertymd-care-proxy/index.ts:255-268`: the edge short-circuit constructs its `GuardrailResult` with `raw: {}` literally. `saveSafetyEvent` (`index.ts:665-681`) then writes `raw_result: result.raw`. There is nothing to lose — the detector at `clinical-policy.ts:52-90` only ever returns `{ crisisType, message }`; the match object and its index are computed at `clinical-policy.ts:83-86` and discarded inside the loop.

### The gap is duplicated, not single

The same `guardrail.raw` is also written to `libertymd_consultations.safety_state` (`index.ts:946`, `:980`, `:1162`). Verified: for the emergency-stopped consults from the deterministic lane, `safety_state` is `{}`; for the one `llm` force-end it holds the nine verdict keys. So the audit hole exists in two tables from one cause.

### The current workaround will break

Today you can recover the trigger text by joining `libertymd_safety_events` to `libertymd_messages` on `consultation_id`. I ran it: all 9 firings resolve to the identical message *"I have crushing chest pain and pain radiating to my left arm."* — confirming §6's 9/9-true-positive claim.

That join is only unambiguous because **every one of the 9 firing consultations has exactly 1 user message**. P0-14b makes the screen run on every turn; at that point a consult has N user messages and no column links an event to the message that triggered it. The workaround stops working precisely when the screen gets more useful.

### Two pattern sets, already drifting, neither versioned

- Edge: `clinical-policy.ts:52-90` — 5 rules, 36-char negation lookbehind, no clause-boundary handling, no third-party-history suppression, first-match-only negation check.
- n8n: `libertymd-guardrail-workflow__9qeE6tUcEY74OYV8.json`, node **Deterministic Prefilter** — 5 rules, 40-char window, splits on clause boundaries (`, ; . ! ? but however although though`), suppresses past-tense family history, and scans **every** match (documented 2026-07-30 false-negative fix).

I executed both rule sets against candidate inputs. Four fire in n8n and **not** at the edge:

| input | edge | n8n |
|---|---|---|
| "it feels like an elephant sitting on me and i am sweaty" | no | yes |
| "i started wheezing after peanut exposure" | no | yes |
| "headache with neck stiffness and confusion" | no | yes |
| "my headache came on suddenly" | no | yes |

Neither set carries a version identifier. Without one, `raw_result` cannot answer "which rule text was live when this fired?", which is the only question that matters after a tuning change.

### Latent PHI hazard in the n8n lane

The n8n **Deterministic Prefilter** emits `message_text` (the verbatim patient message), `history` and `patient` (age, sex) alongside its verdict. `Route Switch` sends the `force_end` branch **straight to `Respond to Webhook`**, which responds with `{{ $json }}` — the whole object. The proxy assigns that response wholesale to `raw` (`index.ts:272`). So on the day the edge screen misses and n8n's broader prefilter catches (see the four rows above), `raw_result` and `safety_state` would receive a full transcript plus demographics, and the client would receive it too via `safety: guardrail`. Unreachable today; one edge-detector regression away from live.

### PHI position — the matched span *is* clinical data, and this is where it may live

**Position:** the matched span is the patient's own words about their body, in a row keyed to `auth.users.id`. It is PHI. It is not "just a regex match".

Where it may go:

- **Allowed:** `libertymd_safety_events.raw_result` only. This is already a clinical table. Exposure is not increased relative to `libertymd_messages`, which stores the same words in full, and RLS on `libertymd_safety_events` is `SELECT` where `user_id = auth.uid()` — a patient can read their own span, nobody else can. Retention is already handled: `libertymd_safety_events_consultation_id_fkey` is `ON DELETE CASCADE`, and `cleanup_expired_libertymd_data()` deletes expired anonymous consultations, so the span expires with the consult without new code.
- **Forbidden:** telemetry (`libertymd_product_events` / Mixpanel), `console.*`, error messages, the proxy's HTTP response body, and `libertymd_consultations.safety_state`. The global DoD already bans the first four; the fifth is a judgement call I am making here — a second copy of PHI in a second table buys no audit value, so the span stays in one place.
- The current `emergency_stopped` product event carries `{ turn_count, source }` only. It stays that way. `libertymd_product_events` is CHECK-constrained to 8 event names; this ticket adds none.

**Consequence for design:** the span cannot simply be added to `guardrail.raw`, because `raw` is returned to the browser (`index.ts:954`, `:1166`) and copied into `safety_state`. The audit payload must be a separate field on the proxy's internal result that only `saveSafetyEvent` reads.

---

## Scope

### In

1. The edge detector returns match provenance: rule id, matched span, span offsets, pattern-set version.
2. A pattern-set version constant for the edge lane.
3. That provenance is persisted to `libertymd_safety_events.raw_result` for `source = 'edge_deterministic'`, and the nine verdict keys are populated too, so the deterministic lane's `raw_result` is queryable on the same shape as the `llm` lane.
4. Egress containment: the provenance never appears in the HTTP response, `safety_state`, logs, or telemetry.
5. An allow-list applied to the n8n guardrail response before it is persisted, so `message_text` / `history` / `patient` cannot reach `raw_result` or `safety_state` if the `source = 'deterministic'` branch ever becomes reachable. **Proxy-side only — the workflow file is not touched.**
6. One committed, runnable audit query.

### Out

- Any change to detection or trigger logic, pattern breadth, or negation behaviour — **P0-14a**. If a test written for this ticket reveals a detection bug, file it against P0-14a; do not fix it here.
- Running the screen on every turn — **P0-14b**.
- Unifying the two pattern sets into one reviewable file — **P0-14a** AC5/AC6.
- LLM-lane `raw_result` enrichment and shadow-mode logging — **P0-15a**.
- `error_fail_cautious` rows (`index.ts:293-304`). A technical failure has no match to record; `{}` is correct there.
- Backfilling the 9 historical rows (see open question O1).
- Any UI, copy, severity-mapping, or telemetry change.

---

## Acceptance criteria

Test commands referenced below already exist: `npm run test:libertymd:policy` (Deno, `tests/libertymd/clinical-policy.test.ts`), `npm run test:libertymd:ci`, `npm run test:libertymd:live`.

1. **Version constant exists.** `grep -n` on `supabase/functions/libertymd-care-proxy/clinical-policy.ts` returns an exported pattern-set version constant. A test asserts it is a non-empty string and that its value changes are visible in the detector's return value.

2. **Detector return shape.** `detectDeterministicEmergency('I have crushing chest pain and pain radiating to my left arm.')` returns an object whose keys are exactly `crisisType`, `message`, `ruleId`, `span`, `spanStart`, `spanEnd`, `patternSetVersion`. Asserted by `Object.keys(...).sort()` in `tests/libertymd/clinical-policy.test.ts`.

3. **Exact values for the canonical case.** For the input in AC2: `ruleId === 'acs_chest_pain'`, `span === 'crushing chest'`, `spanStart === 7`, `spanEnd === 21`. (Verified: the regex at `clinical-policy.ts:56` matches `crushing chest` at index 7 — the second alternative wins because it starts earlier in the string than `chest pain` at index 16. If the implementation returns a different span, the assertion must be updated *and the difference explained in the PR*, because it means the match position changed.)

4. **Span is a verbatim slice of the inbound message.** For any firing input, `message.slice(spanStart, spanEnd) === span` — asserted for all 5 rules, one positive case each. This forces the span to be cut from the original message, not from the internal lowercased copy.

5. **Span is bounded.** Given a 4,000-character message containing one emergency phrase, `span.length <= 120` and `spanEnd - spanStart <= 120`. Test asserts both.

6. **`raw_result` shape for a new `edge_deterministic` firing.** After a force-end through the edge lane, the inserted row satisfies:
   ```sql
   select jsonb_object_keys(raw_result) from libertymd_safety_events
   where source = 'edge_deterministic' and created_at > now() - interval '1 hour';
   ```
   returning exactly: `status, risk_level, crisis_type, force_end, is_emergency, care_setting, message, red_flags, source, match` — and `raw_result -> 'match'` has exactly the keys `rule_id, span, span_start, span_end, pattern_set_version, lane`.

7. **`raw_result` carries no transcript.** For the same row: `raw_result ? 'message_text' = false`, `raw_result ? 'history' = false`, `raw_result ? 'patient' = false`, and `length(raw_result #>> '{match,span}') <= 120`.

8. **n8n response is allow-listed.** With the guardrail webhook stubbed to return `{status:'force_end', ..., message_text:'<full text>', history:[...], patient:{age:41,sex_at_birth:'male'}}`, the persisted `raw_result` contains none of `message_text`, `history`, `patient`. Integration test against the proxy with a stubbed webhook.

9. **HTTP response body contains no span.** The proxy's force-end response (`{ emergency: true, safety: ... }`) satisfies: `JSON.stringify(body).includes(span) === false` and `body.safety.raw.match === undefined`. Asserted for both the turn-1 path (`index.ts:951`) and the mid-conversation path (`index.ts:1166`).

10. **`safety_state` contains no span.**
    ```sql
    select count(*) from libertymd_consultations
    where status = 'emergency_stopped' and safety_state ? 'match';
    ```
    returns `0` after the AC6 run. Additionally `safety_state` for that consult is non-empty (the nine verdict keys), closing the duplicate `{}` gap.

11. **No span in logs.** With `console.log` / `console.error` / `console.warn` captured during a force-end request, no captured argument (after `JSON.stringify`) contains the span substring. Asserted by a spy in the integration test.

12. **No span in telemetry.**
    ```sql
    select distinct jsonb_object_keys(properties) from libertymd_product_events
    where event_name = 'emergency_stopped';
    ```
    returns exactly `turn_count`, `source`. And the `event_name` CHECK constraint on `libertymd_product_events` is unchanged (8 allowed names) — verified via `pg_get_constraintdef`.

13. **Audit query is committed and runs.** A file at `scripts/sql/libertymd-deterministic-firings.sql` returns one row per deterministic firing with columns `created_at, consultation_id, turn_count, crisis_type, rule_id, pattern_set_version, span, lane`, ordered by `created_at desc`. Run against production today it returns **9 rows with `rule_id`, `pattern_set_version`, `span` and `lane` all NULL** (the historical set), plus one populated row per post-deploy firing. Reviewer runs it and pastes the output on the PR.

14. **False-positive review is answerable in one query.** The AC13 query, grouped, answers "how many firings per `rule_id` and per `pattern_set_version`":
    ```sql
    select raw_result #>> '{match,rule_id}' as rule_id,
           raw_result #>> '{match,pattern_set_version}' as version,
           count(*)
    from libertymd_safety_events
    where source = 'edge_deterministic' group by 1,2;
    ```
    executes without error and returns at least one non-null-`rule_id` group after the AC6 run.

15. **Retention regression guard.** Deleting the test consultation removes its safety events:
    ```sql
    delete from libertymd_consultations where id = '<test id>';
    select count(*) from libertymd_safety_events where consultation_id = '<test id>'; -- 0
    ```
    Asserts the `ON DELETE CASCADE` path still carries the span away with the consult.

16. **Detection behaviour is provably unchanged.** `npm run test:libertymd:policy` passes with the 5 pre-existing `detectDeterministicEmergency` assertions (`clinical-policy.test.ts:19,25,30,35,40,45`) **unmodified except for reading the new fields** — no positive/negative verdict in the existing suite flips. `npm run test:libertymd:ci` passes.

---

## Definition of Done additions

Beyond §2 of the ticket specs:

- [ ] AC13's query output for production pasted into the PR description, showing the 9 historical NULL rows and at least one populated row.
- [ ] The new `match` sub-object documented in `CARE-ARCHITECTURE.md` as clinical-only, with the explicit statement that it is excluded from `safety_state`, the response body, logs and telemetry.
- [ ] The pattern-set version constant's bump procedure documented next to it in a comment: any edit to the rule array requires a version bump in the same commit. A reviewer-checkable rule, not automation.
- [ ] Rollback is config-flag or a one-line revert of the `raw_result` composition in `saveSafetyEvent` — no schema migration, no redeploy of n8n. Stated in the PR.
- [ ] Confirmed no new Supabase advisor warnings (no DDL is expected in this ticket; if a migration appears, justify it).
- [ ] Baseline TS check: no new errors against the ~8 pre-existing `LibertyMDChat.tsx` errors.

---

## Dependencies

- **None blocking.** This ships against today's 5-rule edge detector.
- **P0-14a** (five canonical presentations, one reviewable versioned pattern file) *will* re-home the constant introduced here. Ship this first so P0-14a has an audit trail to tune against — P0-14a's AC3 negative corpus is far cheaper to debug when every firing records its rule id and span.
- **P0-14b** (every-turn evaluation) *depends on this* in practice: once a consult can fire at any turn, the `safety_events` → `messages` join is ambiguous and `raw_result` is the only correlation. Recommend sequencing 14c before 14b.
- **P0-15a** (shadow-mode LLM) will add a sibling key to the same `raw_result`. Namespacing the audit payload under `match` leaves room; coordinate the key name.
- **P1-21** (generated columns for hot JSONB scalars) may later promote `match.rule_id` to a column. Not in scope; do not pre-build it.

---

## Risks

| Risk | Severity | Mitigation |
|---|---|---|
| The obvious implementation — putting the span in `guardrail.raw` — leaks PHI to the browser and into `safety_state`, because `raw` is returned at `index.ts:954`/`:1166` and copied at `:946`/`:980`/`:1162`. This is the single most likely way to fail this ticket. | High | AC9, AC10, AC11 exist specifically to catch it. Write them first. |
| An unbounded span turns `raw_result` into a transcript store, especially once a pattern uses a wide `.{0,40}` bridge. | Medium | AC5 caps at 120 chars; AC7 asserts the cap at the DB. |
| Touching the detector's return type risks a behaviour change in the one component we least want to perturb. | Medium | AC16 requires the existing verdict assertions to hold unchanged. The change should be additive to the return object and must not alter the rule array, the loop order, or the negation window. |
| The n8n allow-list (scope item 5) is arguably P0-14a's problem and inflates an XS ticket. | Low | It is ~5 lines in the proxy and the ticket is already defining what `raw_result` may contain. If tech pushes back, split it out — but do not ship a `raw_result` spec that silently permits a transcript. |
| Storing a verbatim span for a mental-health-crisis match is a higher-sensitivity category than a cardiac one. | Medium | Not reachable today (no such rule exists until P0-14a). Raised as O2 rather than legislated here. |
| A reviewer reads "the span is only in `safety_events`" as "the span is inaccessible to the patient". It is not — RLS grants the owner `SELECT`. | Low | Stated explicitly in Context so nobody discovers it later and calls it a leak. |

---

## Open questions

Deliberately not written as acceptance criteria, because I cannot make them mechanically verifiable without a decision first.

- **O1 — Backfill.** The trigger text for the 9 historical rows *is* recoverable from `libertymd_messages` (I recovered it). Should we backfill `raw_result.match` for them? My recommendation is **no**: it would fabricate a `rule_id`, `span` and `pattern_set_version` the code never computed, contaminating the very audit trail the ticket exists to create, and all 9 are same-day internal test traffic. Needs an explicit call before anyone "helpfully" writes the migration.
- **O2 — Span policy for mental-health crises.** P0-14a adds suicidal-ideation detection. Should the span be stored verbatim, hashed, or omitted for that `crisis_type`? Clinician and business-owner input needed; not decidable by engineering.
- **O3 — Fix the n8n echo at source.** Scope item 5 filters `message_text`/`history`/`patient` in the proxy. The cleaner fix is to stop the **Deterministic Prefilter** node emitting them onto the response branch. That is a workflow change and out of bounds for this ticket — should it be raised as a separate ticket, and against which phase?
- **O4 — Version identity for the n8n lane.** The proxy cannot record which n8n pattern-set version fired unless the workflow returns one. Do we require the workflow to emit a version field (workflow ticket), or accept that only the edge lane is versioned until P0-14a unifies them?
