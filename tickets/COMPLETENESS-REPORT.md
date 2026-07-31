# Phase 0 + Phase 1 — Completeness Report & QA Comments

**Date:** 2026-07-30
**Basis:** independent QA of the landed batch (`QA-batch-01/05-qa-report.md`, 63 criteria), live gate output, and file-level verification.
**Headline:** **32 PASS · 20 FAIL · 11 UNTESTABLE.** All six gates green, TS at baseline 103, `falseNegative: 0`.

> ## The one-line summary
>
> **Zero tickets in the batch are complete.** Every gate passes and no ticket meets its own acceptance criteria. The dominant failure is not bad code — it is **half-shipped tickets**: the server side of the severity/safety work landed and the client side did not, so three P0 safety tickets produce correct data that nothing displays.

---

## 1. Scoreboard

| Phase | Tickets | Complete | Partial | Failed | Not started |
|---|---:|---:|---:|---:|---:|
| **Lane 0** (prerequisites) | 7 | **7** | 0 | 0 | 0 |
| **Phase 0** | 30 | 11 | 10 | 2 | 7 |
| **Phase 1** | 25 | 0 | 0 | 0 | **25** |
| **Total** | 62 | 18 | 10 | 2 | 32 |

**Phase 0 is ~37% complete by ticket count, and 0% complete by "passes its own ACs".**
**Phase 1 has not started.**

---

## 2. Lane 0 — complete ✅

| ID | Status | QA comment |
|---|---|---|
| **L0-1** Fix silently-passing contract gate | ✅ | Verified: gate now reports `workflowsChecked: 3` and **hard-fails** if the definitions dir is unresolvable. This was a green light wired to nothing. |
| **L0-2** Fix stale `correctModel` assertion | ✅ | Twice. First a version floor; then the deploy migrated Gemini → OpenAI `gpt-5.6-luna` and `modelName` became `model.value`, blinding it again. Now reads every node shape, asserts an explicit allow-list, and **fails if a model cannot be read at all**. |
| **L0-3** Establish runnable gates | ✅ | deno 2.9.x installed; all six gates confirmed executable. |
| **L0-4** Write `BASELINE.md` | ✅ | 103 TS errors repo-wide (not the 8 I first assumed); per-file counts recorded; the two-tier clinical gate documented so `clinicalReleaseGatePassed: false` is not mistaken for a regression. |
| **L0-5** Decompose `index.ts` | ✅ | 1508 → 90 lines, 22 modules, all 13 actions preserved, dispatch hardened to a `Map`. **QA: 3 PASS, 2 UNTESTABLE** — "pure refactor" and "identical before/after" are unverifiable because the whole batch landed as one uncommitted tree. A pure-refactor ticket must land as its own commit. |
| **L0-6** Correct stale docs | ✅ | Three phantom tables and a phantom `valid_report` column corrected. |
| **L0-7** Separability CI check | ✅ | Wired into `:ci`. Zero cross-product FKs, no proxy cross-imports, `LIBERTYMD_*` vs `N8N_*` webhook separation asserted. FK check reports `SKIPPED` without a DB rather than passing vacuously. |

---

## 3. Phase 0 — ticket by ticket

### ✅ Complete (11)

| ID | QA comment |
|---|---|
| **P0-02** One product or two | Decided: two, LibertyMD hived off later. Superseded by P0-02a. |
| **P0-02a** Enforce separability | Shipped as L0-7. |
| **P0-03** Correct stale docs | Shipped as L0-6. |
| **P0-04** Recompute `missing_slots` | The root cause of repeat questions. Verified by replaying consultation `defd21a5`: `severity` no longer appears in both lists. **Not independently QA'd** — landed outside the cycle. |
| **P0-05** Merge `onset`/`duration` | `duration` removed from `CORE_SLOTS`, legacy answers mapped to `onset`. The 24-asks-across-15-consults offender is gone. **Not independently QA'd.** |
| **P0-06** Guard repeated `target_slot` | Guard added; a filled slot can no longer be re-targeted. **Not independently QA'd.** |
| **P0-09** Remove `alert()` | Zero `alert()`/`confirm()`/`prompt()` remain in `AICareChat.tsx`. Lint rule not added — that AC is unmet. |
| **P0-10** Silent retry, never ask user to restate | Tiered retry, message retained, draft restored. The "restate your symptom" copy is gone. |
| **P0-14** Keep the deterministic screen | Decided, with evidence: 9/9 firings true positives, 0 false positives. |
| **P0-15** Do not raise LLM bar to 90% | Decided: the LLM guardrail produced 1 force_end in 98 events. |
| **P0-20** New-message jump pill | **5/5 PASS.** The only ticket in the batch that fully met its criteria. QA singled out the unpin rule: a scroll only unpins if it follows a real input gesture within 1200 ms, so our own tall-message animation cannot self-unpin and raise a spurious pill. |

### ⚠️ Partial — landed but failing its own ACs (10)

| ID | Verdict | QA comment |
|---|---|---|
| **P0-01** Stack attribution | Partial | I established `ai-care-proxy` vs `libertymd-care-proxy` from code, DB and edge logs — but **never saw executions 7447/7444/7441**. No n8n access. The attribution is inferred, not read. |
| **P0-11** Timeout + circuit breaker | 4 PASS, 1 FAIL | **Server half correct** (rolling window, `holdingState()`, 503, turn not consumed, no fabricated question). **Client half absent**: `invokeCareProxy` throws on any non-2xx and never parses the body, so `holding`, `severity`, `retry_after_ms` and the calm copy are discarded. Worse, `isRetryable` treats ≥500 as retryable, so each send makes **3 attempts** then shows the generic amber error — still one alarming event per turn, exactly what the ticket exists to remove. |
| **P0-12** Failure taxonomy | Partial | Status→copy mapping done in both clients. The full 8-class taxonomy, the offline queue, and silent token refresh are not implemented. |
| **P0-13** Hard invariants | 4 PASS, 1 FAIL | Turn cap, post-emergency inference block, `message_type` enum and JWT-only identity all genuinely enforced with warn-logging and no PHI. **AC5 fails: no test attempts any violation.** `tests/libertymd/support/proxy-doubles.mts` — 294 lines built expressly for these tests — is consumed by nothing. Also **Defect 8**: two writes in `save-demographics.ts` update consultations without a `user_id` filter, bypassing `updateOwnedConsultation`. Not reachable today; the invariant is simply not enforced there. |
| **P0-14a** Extend deterministic screen | Partial | The **n8n** guardrail already had all five presentations plus negation handling — I improved its negation logic (all-matches, clause-boundary, past-tense-only family history; 15/15 cases). The **edge screen** was never brought to parity. The two have drifted: four inputs fire in n8n and not at the edge. |
| **P0-14d** Guardrail on demographics turn | 4 PASS, 1 FAIL | Server correct and well-documented; corpus grew 20 → 22 with a negative control; `FN 0` held. **AC2 fails — and this is Defect 1, BLOCKING (safety):** `submitDemographics` in *both* clients never reads `data.emergency`, so a `force_end` renders as an interview question and the user's next answer 409s. Emergency guidance does not reach the user. QA also credited a trap avoided: writing this turn's verdict unconditionally would have **erased turn 1's `high_risk_continue`** — a safety regression introduced by a safety ticket. |
| **P0-14e** Align guardrail budget | 3 PASS, 1 FAIL | Turn 1's 2s override removed; one 10s config constant with a 5s floor so a secret cannot recreate the defect. QA added a detail I missed: **n8n's own workflow timeout is 60s** — the edge function was aborting at 2s a workflow it had granted 60. **AC3 fails**: the timeout fails cautious correctly but still renders as a clinical caution. |
| **P0-18** Pin emergency to viewport | 4 PASS, 2 FAIL, 1 UNTESTABLE | Genuinely good work on `/liberty-md/chat`: portalled to `body` to escape the `backdrop-blur` containing-block hazard, triggered by consult **state** not message presence (so it survives reload), Escape swallowed, focus trapped, `role="alert"` with focus on the panel. **AC1/AC3 fail — Defect 6:** `LibertyMDApp` (`/liberty-md`) is also a live consult route reaching `emergency_end`, and there emergency copy is still an appended transcript bubble. **Half the live surface is unfixed.** |
| **P0-19** Scroll-anchor after layout | 3 PASS, 2 UNTESTABLE | The mechanism is right: double `requestAnimationFrame` before reading `scrollHeight`, `ResizeObserver` on scroller/content/footer so chip growth re-anchors, `visualViewport` handling with a 500ms settling window so the browser's own scroll adjustment isn't misread as user intent. Reasoned from code; no browser to confirm. |
| **P0-23** Scroll padding | 1 PASS, 2 UNTESTABLE | `pb-10 sm:pb-12` on the scrolled content so it survives every anchor; `<main>` padding correctly changed to `pt-` to avoid doubling. **AC2 is unverifiable as written** — it requires adapting to P0-21's action bar, which hasn't shipped. Ticket defect: an XS ticket with an AC depending on an unshipped M ticket. |

### ❌ Failed — built but does not work (2)

| ID | Verdict | QA comment |
|---|---|---|
| **P0-14f** Transport failure ≠ clinical | 1 PASS, 3 FAIL | The discriminator is persisted correctly (`source: 'error_fail_cautious'`, `severity: 'technical'`, `timeout` vs `transport` from `error.name` not message text) and the internal fail-cautious posture is properly conservative. **But no client reads `safety.source`.** The transport failure still renders in an amber caution box, and on turn 1 `acknowledgement()` additionally appends a clinical sentence to the transcript — **Defect 2, BLOCKING (safety): a network failure writes a clinical caution into the clinical record.** |
| **P0-16** Four-severity mapping | 2 PASS, 3 FAIL | All four tiers defined, mapping proven correct across the whole `status × source` matrix, WCAG-documented, distinguishable beyond hue. **And imported by nothing but its own test — Defect 3.** Every amber box the ticket exists to remove is still live. Worse, **Defect 4**: emergency chrome is still reachable by two other doors — `mapMessages` maps *any* `message_type === 'safety'` row to `kind: 'emergency'` (including `clinical_review_needed`, turn-cap close, off-topic stop), and `emergencyDetail` falls back to `safetyNotice`, which can hold *technical* copy and render it in the red `role="alert"` panel. Unreachability was proven of the function, not of the product. |

### ⬜ Not started (7)

| ID | Note |
|---|---|
| **P0-07** n8n reachability root cause | The reported symptom was resolved differently: `ai-care-proxy`'s only 409 is "session abandoned", and the client showed `alert('temporarily unavailable')` for it. Still needs n8n-side confirmation. |
| **P0-08** Fix executions 7447/7444/7441 | Blocked on n8n execution access. |
| **P0-14b** Run screen every turn | Depends on P0-14a parity. |
| **P0-14c** Log matched span to `raw_result` | Story written (16 ACs) via the PM agent; not built. That story found a real hazard: the span must not go in `guardrail.raw`, which is returned to the browser. |
| **P0-15a** Shadow-mode the LLM guardrail | Not started. Still the only way to learn whether the LLM would catch what the deterministic screen catches. |
| **P0-17** Condition-specific emergency copy | Not started. |
| **P0-18a/18b** Decouple detect/act/show | Not started. This is what delivers the uninterrupted conversation you asked for. |
| **P0-21** Fixed bottom action bar | Not started. Blocks P0-23 AC2. |
| **P0-22** Bottom sheet as overlay | Not started. |
| **P0-24** Mobile viewport correctness | Not started. |

---

## 4. Phase 1 — not started (25)

No P1 ticket has been specced, built or QA'd. Priority order from the register, unchanged:

| ID | Why it matters |
|---|---|
| **P1-01** Unified entry screen | **The single highest-value ticket in the plan** — 35% of confirmed real users are stranded at demographics (40 prompts shown, 23 answered). ⚠️ Carries **blocking AC0**: `submitDemographics` must handle `data.emergency`, or this ticket opens the Defect 1 hole for live users. |
| P1-02…05 | Time promise · profile-aware skip · anonymous single-profile · adults-only |
| P1-06…14 | Interview: progress, staged waiting, speculative pre-warm, partial outcome on abandon, warm recovery, chips, draft persistence, resume copy, comprehension check |
| P1-15…22 | Instrumentation: `product_events` allow list, Mixpanel server + client, **Session Replay masking** (currently ON and will capture symptom text), `landing_sessions`, `turn_facts`, generated columns, dashboard |
| P1-23/24 | Cleanup cron · **Storage cleanup — blocks all Phase 4 upload work** |
| P1-25 | Merge-modal interruption audit |

---

## 5. The pattern QA exposed

Four findings that generalise beyond individual tickets.

**5.1 · Tickets shipped half of themselves.** P0-14f, P0-16, P0-11 and P0-14e each landed a correct server change whose client counterpart is missing. The result is worse than not starting: the data is right, the code is dead, and the defect each ticket exists to fix is still live. **Any ticket spanning proxy and client must have both halves in its file manifest, and QA must trace server → user, not just verify the server.**

**5.2 · Gates green ≠ tickets done.** Six gates passed while 20 criteria failed. My own earlier summary said "all six gates green" and treated that as progress. It wasn't. This is precisely why independent QA exists, and why my summary was misleading.

**5.3 · Tests that never run.** `n8n-breaker.mts` (17 tests, P0-11's entire proof) is wired to no gate **and cannot parse** — a literal `**/*.ts` inside a block comment closes it early. Its own header claims "Verified both ways", which is false. `proxy-doubles.mts` (294 lines) is consumed by nothing. **A test not wired to a gate is not verification, and claiming it as evidence is itself a defect.**

**5.4 · Ticket defects, not code defects.** 11 UNTESTABLE verdicts, and most are my fault as author: L0-5 had no numbered ACs at all; P0-23 AC2 depends on an unshipped ticket; five viewport ACs demand browser verification with no harness in the repo. **An acceptance criterion nobody can execute is a spec bug.**

---

## 6. Recommended order from here

1. **Defect 1** — `submitDemographics` handles `data.emergency` in both clients. Safety, and it blocks P1-01.
2. **Defect 3** — wire `libertymd-severity.ts` into both clients. Unblocks P0-14f, P0-16 and P0-14e AC3 in one change.
3. **Defect 4** — stop `mapMessages` promoting every `safety` row to emergency chrome.
4. **Defect 2** — remove the clinical sentence from the transport-failure path.
5. **Defect 5** — fix `n8n-breaker.mts` parsing and wire it to a gate.
6. **Defect 6** — apply the viewport cluster to `LibertyMDApp`.
7. Then P0-14a edge parity → P0-14b → P0-14c, and P1-01.

**9 hunks are flagged `REQUIRES EXPERT REVIEW`** — the guardrail timeout floor, the removed clinical instruction, `unscreenedTurnResult` writing `status: 'pass'` for an unscreened turn, the demographics screen, `acknowledgement()`, holding-state and turn-cap copy, the severity precedence rules, the standing emergency instruction, and the two new corpus scenarios. Those need a clinician. QA PASS means "the code does what the ticket said", never "this is clinically safe to ship."

---

*Sources: `QA-batch-01/05-qa-report.md` (500 lines, 63 criteria), `L0-5/04-implementation.md`, `P0-14d-14e/04-implementation.md`, `BASELINE.md`, live gate output 2026-07-30.*
