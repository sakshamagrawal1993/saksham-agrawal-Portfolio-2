# QA-batch-01 · Blocking review — 05-qa-report.md

**Reviewer:** QA (independent)
**Date:** 2026-07-31
**Repo:** `/Users/sakshamagrawal/Documents/Projects/saksham-agrawal-Portfolio-2`
**Tickets under review:** L0-5, P0-14d, P0-14e, P0-14f, P0-16, P0-11, P0-13, P0-18, P0-19, P0-20, P0-23
**Inputs read:** `CONTEXT.md`, `BASELINE.md`, `DECISIONS.md`, `LANES.md`, `LibertyMD_Ticket_Specs_Phase0_Phase1.md`
**Deliberately NOT read:** `tickets/L0-5/04-implementation.md`, `tickets/P0-14d-14e/04-implementation.md`

---

> # ⚠️ REQUIRES EXPERT REVIEW (clinician)
>
> This diff touches safety detection, safety thresholds, and user-facing clinical copy. The following hunks must not ship without clinician sign-off. **PASS below means "the code does what the ticket said", never "this is clinically safe to ship."**
>
> | # | File · hunk | Why |
> |---|---|---|
> | E1 | `supabase/functions/libertymd-care-proxy/lib/config.ts:103–110` — `GUARDRAIL_TIMEOUT_FLOOR_MS = 5_000`, `N8N_TIMEOUT_MS.guardrail = 10_000` | A safety **threshold**. Turn 1's guardrail budget moved 2 s → 10 s. It is now also env-overridable (`LIBERTYMD_N8N_TIMEOUT_GUARDRAIL_MS`) down to a 5 s floor. Both the default and the floor are clinical latency/sensitivity trade-offs. |
> | E2 | `lib/errors.ts:78–94` — `guardrailTransportFailureResult()` | New **user-facing copy** replacing a clinical instruction: the old text told the patient "Seek urgent care if symptoms feel severe or dangerous"; the new text gives **no clinical instruction at all**. Removing a safety instruction from a fail-cautious path is a clinical decision, not a UX one. |
> | E3 | `lib/safety.ts:45–62` — `unscreenedTurnResult()` | Writes `status: 'pass'`, `risk_level: 'low'` into `libertymd_safety_events` for a turn that **was never screened**. Any future query that reads `status = 'pass'` as "screened clean" will be wrong. Needs a clinical-data-integrity opinion. |
> | E4 | `actions/save-demographics.ts:109–189` — guardrail on the demographics turn, plus the never-downgrade rule | New safety evaluation on a previously unscreened turn, and new logic deciding when `safety_state` may be overwritten. |
> | E5 | `actions/start-consultation.ts:20–26` — `acknowledgement()` | Emits the clinical sentence *"I also noticed details that deserve extra caution, so I will keep checking for urgent warning signs."* whenever `status === 'high_risk_continue'` — **including when that status was fabricated by a network failure** (see Defect 2). |
> | E6 | `actions/send-message.ts:107` and `:180` — holding-state and turn-cap copy | New patient-facing copy on failure and terminal paths. |
> | E7 | `lib/types.ts:126–202` + `components/LibertyMD/libertymd-severity.ts:75–83` — severity precedence | Encodes "a real emergency is never demoted to a technical notice" and "a caution the user cannot act on is noise". Correctness of that ordering is a clinical judgement. |
> | E8 | `components/LibertyMD/LibertyMDChat.tsx:161–166` — `EMERGENCY_STANDING_INSTRUCTION` | Now the **unconditional** primary emergency instruction, shown even when the model-authored detail is empty. Wording is unchanged from the previous surface, but its role changed from supporting line to sole instruction. |
> | E9 | `tests/libertymd/clinical-scenarios.v0.1.json:214–231` | Two new corpus scenarios, both `clinical_review.status: "pending"`. |

---

# Overall verdict

## FAIL

- **Acceptance criteria:** 63 checked — **32 PASS · 20 FAIL · 11 UNTESTABLE**
- **Standing gates:** all 6 gates pass · `build` pass · TS **103** (baseline 103) · `LibertyMDChat.tsx` **8** (baseline 8) · `falseNegative` **0** · `engineeringRegressionPassed: true`. **No new gate failures, no new TypeScript errors.**
- **Architectural rules:** 5 of 5 hard rules **hold**. No violation found.
- **Blocking:** 11 numbered defects below. The batch's server-side work is largely sound; **the client half of three P0 safety tickets (P0-14d, P0-14f, P0-16) and one reliability ticket (P0-11) was not wired**, and two test suites that the ACs rely on for proof either do not run or do not exist.

---

# Part 1 — Acceptance criteria

Method note: no browser is available in this environment. For viewport ACs I reason from the code and mark honestly which I could not prove. `UNTESTABLE` = cannot be mechanically verified as written; where that is the ticket's fault I say so.

## Setup / evidence baseline

```
$ cd /Users/sakshamagrawal/Documents/Projects/saksham-agrawal-Portfolio-2
$ git status --porcelain | grep -v backup
 M components/LibertyMD/LibertyMDCareControls.tsx
 M components/LibertyMD/LibertyMDChat.tsx
 M deno.lock
 M scripts/libertymd-contract-validation.mjs
 M supabase/functions/libertymd-care-proxy/index.ts
 M tests/libertymd/clinical-policy.test.ts
 M tests/libertymd/clinical-scenarios.v0.1.json
?? components/LibertyMD/LibertyMDChatScroll.tsx
?? components/LibertyMD/LibertyMDEmergencyAlert.tsx
?? components/LibertyMD/libertymd-severity.ts
?? supabase/functions/libertymd-care-proxy/actions/
?? supabase/functions/libertymd-care-proxy/lib/
?? tests/libertymd/n8n-breaker.mts
?? tests/libertymd/severity-mapping.test.ts
?? tests/libertymd/support/
```

```
$ git diff --stat | tail -3
 tests/libertymd/clinical-scenarios.v0.1.json     |   18 +
 7 files changed, 423 insertions(+), 1523 deletions(-)
```

---

## L0-5 · Decompose `libertymd-care-proxy/index.ts`

The spec for L0-5 lives in `LANES.md` ("L0-5 target structure"), not in the ticket-spec file, and has **no numbered ACs**. I derived five checks from the stated target and the stated verification method. *(Ticket defect: an M-sized structural ticket with no numbered ACs.)*

| # | Criterion | Method | Observed | Verdict |
|---|---|---|---|---|
| L0-5.1 | `index.ts` becomes dispatch only (~120 lines) | `wc -l` old vs new | old **1508** → new **90**. Contains only CORS/method, `req.json()`, `createProxyContext`, `HANDLERS.get`, and one catch. No business logic. | **PASS** |
| L0-5.2 | Target module set exists (`actions/{bootstrap,start-consultation,save-demographics,send-message,abandon-resume,report,identity,reads}.ts`, `lib/{safety,slots,telemetry,errors,n8n-client}.ts`, `clinical-policy.ts` retained) | `find … \| xargs wc -l` | All 13 named modules present. Plus 6 not in the target (`lib/{config,consultations,context,profiles,types,utils}.ts`) — a superset, and a reasonable one. `clinical-policy.ts` still **147** lines, byte-identical (`git diff` empty). | **PASS** |
| L0-5.3 | All 13 proxy actions preserved | diff old `action === '…'` chain vs new `HANDLERS` Map | Old: bootstrap, abandon_consultation, resume_consultation, start_consultation, save_demographics, send_message, prepare_account_merge, complete_account_merge, release_report, sync_identity, record_identity_event, get_history, get_consultation. New Map: identical 13, same order. Dispatch hardened to a `Map` (prototype-pollution safe). | **PASS** |
| L0-5.4 | "Pure refactor. No behaviour change." | read the diff | **Not true of the landed diff.** It also contains deliberate behaviour changes: guardrail budget on turn 1 `2_000` → `N8N_TIMEOUT_MS.guardrail` (10 s), `message_type: 'question'` → `'normal'`, the circuit breaker in `postJson`, the P0-13 invariant guards, and the P0-14d demographics screen. Those belong to other tickets in the same batch. | **UNTESTABLE** |
| L0-5.5 | "Verified by the existing suite passing identically before and after" | run all gates | Suite passes now (Part 2). It cannot be shown to pass *identically*: everything landed in one uncommitted working tree, so there is no L0-5-only revision to compare against. **Ticket/process defect, not a code defect** — a pure-refactor ticket whose verification method is "identical before and after" must land as its own commit. | **UNTESTABLE** |

*(Note: the task brief said "1508 → 80 lines"; the file is 90 lines. Immaterial — LANES.md said ~120.)*

---

## P0-14d · Guardrail must run on the `save_demographics` turn

| # | Criterion | Method | Observed | Verdict |
|---|---|---|---|---|
| 1 | `save_demographics` runs the guardrail on any free-text the user supplies on that turn | read `actions/save-demographics.ts` | `:57 const freeText = cleanMessage(payload.message)`; `:109–114 Promise.all([freeText ? runGuardrail(freeText, history, patientPayload(patient), slots) : unscreenedTurnResult(...), runInterview(...)])`. Full budget (no `timeoutMs` arg → `N8N_TIMEOUT_MS.guardrail`). Guardrail and interview run in separate failure domains, as in `send_message`. | **PASS** |
| 2 | A `force_end` on that turn terminates correctly **and emergency copy precedes everything, including the interview question** | trace server → client | **Server: correct.** `:120–151` writes the `safety` assistant message, sets `emergency_stopped`, discards the interview result, emits `emergency_stopped`, returns `{emergency: true, message}`. **Client: swallows it.** `LibertyMDChat.submitDemographics` (`:643–678`) and `LibertyMDApp.submitDemographics` (`:682–707`) never read `data.emergency` / `data.state`; both unconditionally `setPhase('intake')` and render `String(data?.next_question \|\| 'When did this symptom begin?')`. The user is shown an interview question instead of emergency guidance, then their next answer 409s with *"Consultation cannot accept answers in emergency_stopped"*. Emergency guidance does not reach the user. | **FAIL** |
| 3 | A `safety_events` row is written for the turn, as on every other turn | read code | `:118 await saveSafetyEvent(ctx, consultation, guardrail, consultation.turn_count)` — before any interview decision is acted on, on both branches. The no-free-text case still writes a row via `unscreenedTurnResult`. | **PASS** |
| 4 | Corpus scenario added: emergency phrasing during the demographics step must force-end | `git diff tests/libertymd/clinical-scenarios.v0.1.json`; run evaluation | Two scenarios added: `demographics_turn_emergency` (`expected.emergency_action: force_end`) and its negative control `demographics_turn_negated_red_flag` (`continue`). Corpus 20 → **22**; evaluation TP 9 / TN 13 / FP 0 / **FN 0**. Matches BASELINE. | **PASS** |
| 5 | If that turn carries no free-text in some flows, that is **documented** rather than left implicit | read module header | `actions/save-demographics.ts:14–34` states the finding explicitly, names both clients, names the server-composed history string, and records that a `force_end` render on this turn is not wired. Documented to the letter. | **PASS** |

## P0-14e · Align the guardrail timeout budget across turns

| # | Criterion | Method | Observed | Verdict |
|---|---|---|---|---|
| 1 | Turn 1's guardrail budget ≥ later turns; justify any remaining difference | grep old vs new call sites | Old: `index.ts:891 runGuardrail(…, 2_000)` on turn 1 vs `:253 timeoutMs = 10_000` default elsewhere. New: `actions/start-consultation.ts:41 runGuardrail(message, initialHistory, …)` — **no timeout argument**, so one shared constant. No remaining difference, therefore nothing to justify; the reasoning is written out at `lib/config.ts:67–101`. | **PASS** |
| 2 | Budgets are config, not inline literals | read `lib/config.ts` | `N8N_TIMEOUT_MS = { guardrail: envInt('LIBERTYMD_N8N_TIMEOUT_GUARDRAIL_MS', 10_000, 5_000, 60_000), interview: 25_000, diagnosis: 55_000 }`. Zero inline timeout literals remain at call sites (`grep "postJson("` shows all four sites pass either `timeoutMs` or `N8N_TIMEOUT_MS.*`). Guardrail is clamped to a 5 s floor so a secret cannot recreate the defect. | **PASS** |
| 3 | A timeout on turn 1 is verified to fail cautious, and to render as **technical**, not as a clinical caution | read code + run policy gate | Fails cautious: **yes** (`lib/safety.ts:134` → `guardrailTransportFailureResult('timeout')` → `status: 'high_risk_continue'`, `severity: 'technical'`). Renders technical: **no.** `start_consultation` returns `safety: guardrail` (`:139`), `LibertyMDChat:513 setSafetyNotice(data.safety?.message)`, and `LibertyMDChat:1072–1076` renders it in `border-l-2 border-amber-500 bg-amber-50 text-amber-900` — the caution treatment. Additionally `acknowledgement()` appends a clinical caution sentence (Defect 2). The tier is computed correctly and then thrown away. | **FAIL** |
| 4 | Corpus run confirms no emergency scenario regresses at the new budget | `npm run test:libertymd:evaluation` | FN 0, sensitivity 1.0, specificity 1.0, `engineeringRegressionPassed: true`. *(Weak evidence by construction: the corpus is offline and never exercises an n8n timeout, so it could not regress from a budget change. That is a limitation of the AC, not of the work.)* | **PASS** |

## P0-14f · Guardrail transport failure must not wear clinical clothing

| # | Criterion | Method | Observed | Verdict |
|---|---|---|---|---|
| 1 | Transport/timeout failure and genuine medium risk are distinguishable in the persisted record — `source` carries `error_fail_cautious`; **the UI must key off it** | read code; grep client | Persistence: **yes.** `source: 'error_fail_cautious'` preserved (`lib/errors.ts:88`) and `raw: { screened: false, failure, severity: 'technical' }` written to `safety_events.raw_result` and into `consultations.safety_state`. `timeout` vs `transport` drawn from `error.name`, not from message text. UI: **no.** `grep -n "source" components/LibertyMD/LibertyMDChat.tsx components/LibertyMD/LibertyMDApp.tsx` → no client reads `safety.source`. The discriminator exists and nothing consumes it. | **FAIL** |
| 2 | The user sees a **technical** message for transport failure, never a clinical caution | trace to render | Copy is technical (`lib/errors.ts:86`). Presentation is not: amber caution box in both clients (`LibertyMDChat:1073`, `LibertyMDApp:1156`), and on turn 1 the transcript additionally gains the clinical sentence from `acknowledgement()`. | **FAIL** |
| 3 | The internal fail-cautious posture is unchanged; the consult is still treated conservatively | read code | `status: 'high_risk_continue'`, `risk_level: 'medium'`, `force_end: false`. Downstream: `send-message.ts:511 nextStatus = 'high_risk'`; `save-demographics.ts:159–162` never downgrades an inherited `high_risk_continue`; `session-recovery.ts:resolveLibertyMDResumeStatus` resumes at `high_risk`. Asserted by `P0-14f AC3/AC4 · a failing guardrail is technical to the user and cautious internally` (policy gate, ok). | **PASS** |
| 4 | Test: stub the guardrail to fail, assert the **rendered** severity is technical and the persisted safety state is still cautious | inspect + run tests | The running test (`severity-mapping.test.ts`, via the policy gate) constructs `guardrailTransportFailureResult(...)` and asserts the *mapping function*. It does **not** stub the guardrail and does **not** assert anything rendered. The test that does stub the guardrail (`tests/libertymd/n8n-breaker.mts`) **never executes** — see Defect 5. | **FAIL** |

## P0-16 · Four-severity mapping

| # | Criterion | Method | Observed | Verdict |
|---|---|---|---|---|
| 1 | Four visually distinct treatments implemented and mapped mechanically | read `libertymd-severity.ts` + `LibertyMDCareControls.tsx` | `LIBERTYMD_SEVERITY_PRESENTATION` defines all four tiers (container/icon/label/body/role/live/iconName); `LibertyMDSeverityNotice` renders whichever tier it is handed and nothing else; `info` renders `null` by design. Mapping is a pure function of `status` + `source` in both runtimes. | **PASS** |
| 2 | Mapping is data-driven from `status` + `source` — **no ad-hoc styling decisions in components** | grep for consumers | `grep -rn "LibertyMDSeverityNotice\|LibertyMDSafetyNotice\|LibertyMDRequestErrorNotice\|libertymd-severity" components/` → **only** `LibertyMDCareControls.tsx` (the definitions) and `tests/`. **No component renders any of it.** The ad-hoc styling the ticket exists to remove is all still live: `LibertyMDChat:1073` (safety notice, amber), `:1100` (error, amber), `:1044–1052` (bubble `kind` → colour ladder); `LibertyMDApp:1156`, `:1171`, `:1128–1137`. The `LibertyMDCareControls.tsx:150–180` comment block spells out the two-step adoption "not done here". | **FAIL** |
| 3 | `error_fail_cautious` renders **technical**, never caution | trace to render | Mapping asserted correct by `P0-16 AC3 · error_fail_cautious renders technical, never caution` (policy gate, ok). Actual render: amber caution box, both clients. | **FAIL** |
| 4 | Emergency styling is unreachable for any non-`force_end` signal. Asserted by test | run policy gate + read render tree | The mapping claim is genuinely proven over the whole `status × source` matrix (4 tests, ok), including that a server-supplied `severity` cannot promote a signal. **But the UI reaches emergency chrome by two other doors:** (a) `LibertyMDChat:399–405 mapMessages` maps **any** `message_type === 'safety'` row to `kind: 'emergency'` → red bubble at `:1048` — and `send-message.ts` writes `message_type: 'safety'` for `clinical_review_needed`, the turn-cap close, and the off-topic stop, none of which is a `force_end`; (b) `LibertyMDChat:936–938` falls `emergencyDetail` back to `safetyNotice`, which can hold the *technical* transport-failure copy, and then renders it inside the red `role="alert"` emergency panel. Unreachability is proven of the function, not of the product. | **FAIL** |
| 5 | Each level meets WCAG AA contrast and does not rely on colour alone | read table + run test | Every tier carries a text `label` plus a distinct `iconName`; `caution` is a left-rule annotation and `technical` a full-bordered card, so they differ in shape as well as hue. Documented ratios (9.4:1, 10.2:1, 8.5:1) are plausible for the stated hex pairs. Asserted by `P0-16 AC1/AC5 · all four tiers are present, visually distinct, and labelled` and `P0-16 AC1 · caution, emergency and technical are distinguishable beyond hue` (both ok). *Scope caveat: this covers the table, not the amber boxes actually on screen.* | **PASS** |

## P0-11 · Timeout budgets and circuit breaker

| # | Criterion | Method | Observed | Verdict |
|---|---|---|---|---|
| 1 | Each n8n call has an explicit, configurable timeout; values documented | read `lib/config.ts`, grep call sites | guardrail 10 s / interview 25 s / diagnosis 55 s, each `envInt`-overridable with clamping and warn-on-clamp. Documented at `:67–144`. All four `postJson` call sites pass a budget. | **PASS** |
| 2 | Guardrail timeout has a defined fail-safe behaviour, reviewed as a safety decision — must not silently downgrade to "no risk" | read code | Defined at `lib/errors.ts:78–94` with the reasoning written out; the decision point is `lib/safety.ts:123–135`. `runGuardrail` runs `detectDeterministicEmergency` **before any transport** (`:85`), so a deterministic force-end survives any breaker state. There is no path returning `status:'pass'` / `risk_level:'low'` on failure. **Flagged E1/E2 for clinician review** — "reviewed as a safety decision" is a human gate QA cannot close. | **PASS** |
| 3 | After N consecutive failures on a stage, the breaker trips and **the UI shows one calm holding state rather than repeating errors** | read code; trace client | Server half: **correct.** `lib/n8n-client.ts:228–241` (rolling window, any success clears), `send-message.ts:312, 409–415` returns `holdingState()` — 503, `severity: 'technical'`, turn not consumed, no fabricated question in the transcript. Client half: **absent.** `LibertyMDChat:386–390 invokeCareProxy` throws on any non-2xx (`functionError`) and never parses the body, so `holding`, `severity`, `retry_after_ms` and the calm copy are all discarded. Worse, `isRetryable` (`:754–758`) treats `>= 500` as retryable, so each send makes **3 attempts** (1 s + 3 s backoff) and then shows the generic amber `error` box — i.e. still one alarming event per turn, exactly what the ticket exists to remove. | **FAIL** |
| 4 | Breaker state is observable (logged/telemetered) and auto-recovers on a successful probe | read code; run the breaker test | Observable: `n8nBreakerSnapshot()` (stage, state, recent_failures, threshold, trips, retry_after_ms — no PHI), plus warn/log lines on open, half-open, probe issued, probe failed, closed. Auto-recovery: `admit()` → `half_open` on cooldown expiry, one probe only, `recordSuccess` closes. The 17-test suite that proves this **does not run** (Defect 5); when repaired locally, 16/17 pass. | **PASS** |
| 5 | Budgets and thresholds are config, changeable without redeploy | read `lib/config.ts` | `N8N_BREAKER` = `LIBERTYMD_N8N_BREAKER_FAILURE_THRESHOLD` (4, clamped 2–100), `…_WINDOW_MS` (120 s), `…_COOLDOWN_MS` (60 s). All secrets, all clamped. | **PASS** |

## P0-13 · Hard invariants enforced in the proxy

| # | Criterion | Method | Observed | Verdict |
|---|---|---|---|---|
| 1 | Turn count cannot exceed 15; enforced server-side; at the cap the consult transitions deterministically (report if valid, else `clinical_review_needed`) | read code | `MAX_TURNS = 15` (config). `send-message.ts:259–261` computes `atCap`, calls `assertTurnWithinCap` (throws `InvariantViolation('max_turns')`, 409, warn-logged). `closeAtTurnCap()` looks up a validated report and honours it (`report_pending_auth`/`completed`), otherwise `clinical_review_needed` with `resolution_reason: 'turn_limit_reached'`. No new diagnosis is run at the cap. | **PASS** |
| 2 | No Interview or Diagnosis call is possible when status is `emergency_stopped`; attempts rejected and logged | read code | Closed allow-list `INFERENCE_ALLOWED_STATUSES = ['awaiting_demographics','interviewing','high_risk']`. Checked at `send_message` entry (`:213`, 409 + warn with `invariant`, `consultation_id`, `status`, `jwt_subject`, **no message body**) and again inside `runInterview` (`:346`) and `runDiagnosis` (`:426`, which reads `consultation.status` so every diagnosis call site is covered by construction). `PostEmergencyInferenceError` is re-thrown, never swallowed by the fallback catch. | **PASS** |
| 3 | Every `messages` row has exactly one non-null `message_type` from a closed enum | read code | `addMessage` is the sole writer (`grep "from('libertymd_messages').insert"` → 1 hit). `MESSAGE_TYPES` mirrors the CHECK constraint; an out-of-enum value throws `InvariantViolation('message_type_enum')`; absent → explicit `'normal'` rather than relying on the column default. The pre-existing `message_type: 'question'` (which could only ever have failed the CHECK) is now `'normal'`. | **PASS** |
| 4 | No write occurs to a consultation not owned by the JWT subject | read every write | Identity is JWT-only (`lib/context.ts:38–40`; `grep payload.user_id` → none). `updateOwnedConsultation` asserts ownership *and* filters `.eq('user_id')` *and* treats zero rows as a violation. No reachable violation exists — every write path first reads through `getOwnedConsultation`. **But the invariant is not enforced at 2 writes:** `actions/save-demographics.ts:123` and `:190` update `libertymd_consultations` with `.eq('id', …)` and **no** `user_id` filter, bypassing `updateOwnedConsultation`. See Defect 8. | **PASS** |
| 5 | **Each invariant has a test that attempts the violation and asserts rejection** | grep tests | `grep -rn "assertTurnWithinCap\|assertConsultationOwned\|InvariantViolation\|handleSendMessage\|message_type_enum\|assertInferenceAllowed\|PostEmergencyInference" tests/ scripts/` → **one hit, in a comment.** No test attempts any of the four violations. `tests/libertymd/support/proxy-doubles.mts` (294 lines) was built expressly for these tests — its own header says so — and no test file consumes it. | **FAIL** |

## P0-18 · Pin emergency instruction to the viewport (safety-grade)

| # | Criterion | Method | Observed | Verdict |
|---|---|---|---|---|
| 1 | On `force_end`, the emergency instruction renders as a pinned overlay/sticky region in the viewport at render, regardless of prior scroll position | read code; check routes | For `/liberty-md/chat`: **holds by construction.** `LibertyMDEmergencyAlert` is `createPortal(..., document.body)` with `fixed inset-0 z-[120]`; portalling to `body` removes the ancestor-`backdrop-filter`/`transform` containing-block hazard that `LibertyMDChat`'s `backdrop-blur-xl` header/footer and the site's Lenis layer would otherwise create. Trigger is consult **state** (`phase === 'emergency_end'`, set from `status === 'emergency_stopped'` at `:138`, so it also survives a page reload) rather than the presence of a correctly-typed message — a real improvement on the old `find(kind === 'emergency')`. **For `/liberty-md` (`LibertyMDApp`, also a live consult route — `App.tsx:202–206`, reaches `emergency_end` at `LibertyMDApp:617–623`): not applied.** Emergency copy is still an appended transcript bubble (`:1128–1137`). Half the live surface area is unfixed. | **FAIL** |
| 2 | Verified at 320px, 375px, 768px and 1440px, and with the mobile keyboard open | — | No browser and no device available. The code has the right mechanisms (`w-full max-w-lg`, `max-h-full`, three-row flex with only the middle row scrollable, `visualViewport` top/left/width/height sync, composer blur on mount to retract the iOS keyboard) but "verified at four widths and with the keyboard open" cannot be mechanically checked from source. The AC's own DoD+ demands physical devices. | **UNTESTABLE** |
| 3 | It cannot be scrolled out of view while the consult is in `emergency_stopped` | reason from code | Holds for the chat route: a `position: fixed` box's containing block is the viewport, the portal guarantees no ancestor can re-parent it, and no scroll handler touches its visibility. Does not hold on the `LibertyMDApp` route (AC1). | **FAIL** |
| 4 | Dismissible only by explicit acknowledgement — never by scroll, tap-outside, or back-gesture | read code | No `onClick`/`onMouseDown` on the backdrop; `Escape` is explicitly `preventDefault`ed and swallowed (`:100–105`); Tab is trapped within the layer; visibility is `isEmergencyStopped && !isEmergencyAcknowledged`, and `setIsEmergencyAcknowledged(true)` is called from exactly one place — the button. Not tied to any history entry, so a back gesture cannot dismiss it. A fresh emergency resets the flag (`LibertyMDChat:433–435`). | **PASS** |
| 5 | After acknowledgement it remains accessible; "start new consult" does not bury it | read code | `LibertyMDEmergencyPinnedBar` renders in the footer — a `shrink-0` flex sibling of the transcript inside `h-[100svh] overflow-hidden`, so it reserves viewport space the transcript cannot scroll over — with a "Show details" button that reopens the full alert. The transcript copy is deliberately retained as the durable record. `startOver` (`:905–910`) navigates away rather than clearing the bar in place. | **PASS** |
| 6 | Screen-reader announced immediately (`role="alert"`, focus moved) | read code | `role="alert" aria-live="assertive" aria-atomic="true"` on the panel; `tabIndex={-1}` + `panelRef.current?.focus({ preventScroll: true })` on mount, with the previously focused element blurred first. Focus lands on the panel, not the button, so the instruction is read. The retained transcript section carries no live region, so it cannot double-speak. On acknowledgement, focus moves to the pinned bar's reopen button rather than falling back to `body`. | **PASS** |
| 7 | **Automated test asserts in-viewport at render for all four widths** | list test files | `ls tests/libertymd` → `abandoned-chat-recovery.test.ts`, `clinical-policy.test.ts`, `clinical-scenarios.v0.1.json`, `contracts/`, `n8n-breaker.mts`, `severity-mapping.test.ts`, `support/`. **No test renders any component and no test mentions 320/375/768/1440.** No DOM test harness exists in the repo. | **FAIL** |

## P0-19 · Scroll-anchor after layout, not on state set

| # | Criterion | Method | Observed | Verdict |
|---|---|---|---|---|
| 1 | After a new assistant message with option chips, the full message and its chips are in view without manual scrolling | reason from code | Holds. The old effect called `scrollIntoView` in the same commit that set state; `useLibertyMDChatScroll` instead schedules a **double `requestAnimationFrame`** before reading `scrollHeight`/`clientHeight` (`:118–128`), so React has committed and the browser has laid out. Chips live in the footer, which is `observe`d by the `ResizeObserver` (`:205`), so the footer growing (and the transcript's `clientHeight` shrinking) triggers a re-anchor rather than leaving the anchor short by the chip height — the exact reported mechanism. *Reasoned from code; not browser-verified.* | **PASS** |
| 2 | Holds when content grows after initial render (progressive reveal, late-loading chips) | reason from code | Holds: `ResizeObserver` on the scroller, the content wrapper (`contentRef`) and the footer (`footerRef`), each re-anchoring while `pinnedRef` or `forceRef` is set. The `frameRef` guard collapses a burst into the already-scheduled frame and deliberately does **not** reschedule, so content resizing every frame cannot starve the anchor. | **PASS** |
| 3 | Holds with the mobile keyboard open and on keyboard dismissal | reason from code | Holds: `visualViewport` `resize` handler re-anchors with `'instant'` (deliberately not `'smooth'`, to avoid racing the keyboard animation), and sets `viewportSettlingUntilRef` for 500 ms so the browser's own `scrollTop` adjustment during a viewport change is not misread as "the user scrolled up". | **PASS** |
| 4 | No visible scroll jank or double-jump | — | Perceptual; cannot be measured from source. The code has the right mitigations (single scheduled frame, `target - scrollTop <= 1` early return so an in-progress animation is not restarted per growth tick, `prefers-reduced-motion` honoured, first anchor `'instant'`). | **UNTESTABLE** |
| 5 | Verified at all four widths from P0-18 | — | No browser, no test. | **UNTESTABLE** |

## P0-20 · "New message ↓" jump affordance

| # | Criterion | Method | Observed | Verdict |
|---|---|---|---|---|
| 1 | When the user is scrolled away from the bottom and new content arrives, auto-scroll is suppressed and a "new message" pill appears | reason from code | Holds. `revision` effect anchors only `if (pinnedRef.current)`; a separate effect on `messageRevision` sets `showJumpToLatest` when `!pinnedRef.current`. The two revisions are deliberately distinct (`messages.length` vs everything), so the thinking bubble appearing cannot announce "new message" to someone reading further up. The unpin rule is the sharp part and it is right: a scroll only unpins if it follows a real input gesture (`wheel`/`touchstart`/`touchmove`/`pointerdown`/`keydown`) within 1200 ms, which prevents our own tall-message animation from self-unpinning and raising a spurious pill. `keydown` is bound on `window`, so PageUp/Home with focus on `body` counts. | **PASS** |
| 2 | Tapping the pill scrolls to the newest message and dismisses the pill | read code | `jumpToLatest` sets `pinnedRef = true`, `setShowJumpToLatest(false)`, `anchorToBottom('smooth')`. | **PASS** |
| 3 | The pill auto-dismisses when the user reaches the bottom by their own scrolling | read code | `onScroll`: `if (distanceFromBottom <= 120) { pinnedRef = true; setShowJumpToLatest(false); return }` — unconditional on cause, which is what AC3 asks for. | **PASS** |
| 4 | "Scrolled away from bottom" uses a tolerance band, not exact position | read code | `NEAR_BOTTOM_TOLERANCE_PX = 120`, exported and documented as "roughly one short message", covering sub-pixel rounding and elastic overscroll. | **PASS** |
| 5 | **Exception:** emergency always takes the viewport regardless of scroll position | read code | `force: isEmergencyStopped` → the `revision` effect forces `pinnedRef = true`, hides the pill and anchors `'instant'`, bypassing the band; `forceRef` keeps the `ResizeObserver` and `visualViewport` handlers anchoring too; the pill is additionally suppressed while `isEmergencyStopped`. And the instruction itself does not depend on any of this — it is a fixed portal. | **PASS** |

*(Same surface caveat as P0-18 AC1: none of this is applied to the `/liberty-md` `LibertyMDApp` route. Counted once, as Defect 6.)*

## P0-23 · Scroll padding below the newest message

| # | Criterion | Method | Observed | Verdict |
|---|---|---|---|---|
| 1 | Persistent bottom padding keeps the newest message clear of the composer and action bar | read code | `TRANSCRIPT_BOTTOM_CLEARANCE_CLASS = 'pb-10 sm:pb-12'` applied to the **scrolled content** (`LibertyMDChat:1000`), so it is part of `scrollHeight` and survives every anchor — not a collapsible margin and not a conditional spacer. The `<main>` padding was correctly changed from `py-5 sm:py-8` to `pt-5 sm:pt-8` so the clearance is not doubled. The trailing `<div ref={messagesEndRef} />` sentinel was removed, consistent with the new anchoring model. | **PASS** |
| 2 | Padding adapts when the action bar (P0-21) is present or absent | read code | The padding is a fixed constant and does not adapt. **The AC is not verifiable as written: P0-21 has not shipped, so there is no action bar to adapt to.** Mitigation is present in a different form — the footer is `observe`d by the `ResizeObserver`, so any footer growth (chips, the acknowledged emergency bar, a future action bar) shrinks the scroller and re-anchors, and the footer reserves layout space rather than overlaying. **Ticket defect:** an XS ticket carrying an AC that depends on an unshipped M ticket. | **UNTESTABLE** |
| 3 | Verified with keyboard open | — | No browser. | **UNTESTABLE** |

---

# Part 2 — Standing gates

All commands run from the repo root with `export PATH="/tmp/deno/bin:$PATH"` (deno 2.9.4, installed as instructed).

### `npm run test:libertymd:contracts` — **PASS**
```
{
  "schemas": 3,
  "fixtures": 8,
  "fixtureFailures": [],
  "workflowsChecked": 3,
  "workflowResults": [
    { "workflow": "guardrail",  "active": true, "models": ["gpt-5.6-luna"], "llmNodeCount": 1, "unreadableModelNodes": [], "correctModel": true, "noPayloadRetention": true, "timeout": 60 },
    { "workflow": "interview",  "active": true, "models": ["gpt-5.6-luna"], "llmNodeCount": 1, "unreadableModelNodes": [], "correctModel": true, "noPayloadRetention": true, "timeout": 60 },
    { "workflow": "diagnosis",  "active": true, "models": ["gpt-5.6-luna"], "llmNodeCount": 3, "unreadableModelNodes": [], "correctModel": true, "noPayloadRetention": true, "timeout": 60 }
  ],
  "clinicalScenarioSuite": { "scenarios": 22, "valid": true, "errors": [] },
  "passed": true
}
EXIT=0
```
Non-zero on every axis (3 schemas, 8 fixtures, 3 workflows, 5 LLM nodes, 22 scenarios). The `APPROVED_MODELS` allow-list plus `unreadableModelNodes` replaces the version-floor pattern, which is the right fix for the failure mode described in BASELINE (a schema move silently blinding the gate).

### `npm run test:libertymd:separability` — **PASS (with one check skipped)**
```
{
  "results": [
    { "check": "cross_product_foreign_keys", "status": "SKIPPED", "note": "run with --with-db and SUPABASE_DB_URL" },
    { "check": "no_proxy_cross_imports", "status": "PASS", "found": [] },
    { "check": "libertymd_calls_own_workflows_only", "status": "PASS",
      "webhookVarsFound": ["LIBERTYMD_DIAGNOSIS_WEBHOOK","LIBERTYMD_GUARDRAIL_WEBHOOK","LIBERTYMD_INTERVIEW_WEBHOOK","LIBERTYMD_N8N_WEBHOOK_SECRET"], "found": [] }
  ],
  "checksRun": 2, "failures": [], "passed": true
}
```
`checksRun: 2` (not 0), so not a silent-pass. Worth stating plainly: the cross-product-FK assertion — the mechanical guard on the Dr. Jivi separation decision — **was not exercised**, here or in BASELINE. Not this batch's fault. The `envOr(fallback, () => Deno.env.get('LIBERTYMD_…'))` thunk shape in `lib/config.ts` deliberately preserves the literal that check 3 greps for; that survived the decomposition.

### `npm run test:libertymd:policy` — **PASS · 30 tests (baseline 15)**
```
running 30 tests from ./tests/libertymd/clinical-policy.test.ts
P0-16 · proxy and client severity mappings agree on the whole status x source matrix ... ok
P0-16 · the technical source lists are identical in both runtimes ... ok
P0-16 · a null or absent signal is info, never a notice ... ok
P0-16 AC4 · emergency severity is unreachable for any non-force_end signal ... ok
P0-16 AC4 · force_end reaches emergency even when the source is a technical one ... ok
P0-16 AC4 · the inline-notice helper cannot produce emergency from a caution or a fault ... ok
P0-16 AC4 · a server-supplied severity cannot promote a signal to emergency ... ok
P0-16 AC3 · error_fail_cautious renders technical, never caution ... ok
P0-16 · a genuine high_risk_continue is still caution ... ok
P0-14f AC3/AC4 · a failing guardrail is technical to the user and cautious internally ... ok
P0-14f AC2 · the transport-failure copy is about the app and gives no clinical instruction ... ok
P0-14f · a client-side request failure is technical ... ok
P0-16 AC1/AC5 · all four tiers are present, visually distinct, and labelled ... ok
P0-16 AC1 · caution, emergency and technical are distinguishable beyond hue ... ok
P0-16 · the info tier renders nothing rather than an empty notice ... ok
Heart Attack fixture force-ends before model inference ... ok
negated emergency terms do not false-positive ... ok
[… 13 pre-existing clinical-policy tests …]
ok | 30 passed | 0 failed (12ms)
```
+15 tests, all from `severity-mapping.test.ts`, registered via `import './severity-mapping.test.ts'` at the head of `clinical-policy.test.ts` (`deno test` collects every `Deno.test` reached through the module graph). This is a legitimate way to land a suite without touching `package.json`, and it does run. Contrast with Defect 5.

### `npm run test:libertymd:recovery` — **PASS · 5 tests**
```
running 5 tests from ./tests/libertymd/abandoned-chat-recovery.test.ts
abandoned consultations resume from their preserved active state ... ok
legacy abandoned consultation without demographics resumes at demographics ... ok
legacy abandoned consultation restores a high-risk interview safely ... ok
legacy abandoned consultation with demographics resumes normal interview ... ok
terminal statuses are never treated as resumable states ... ok
ok | 5 passed | 0 failed (2ms)
```

### `npm run test:libertymd:simulations` — **PASS · 10 loops**
```
{ "loops": [ …loop 1..10, each "passed": true… ], "passed": true }
```

### `npm run test:libertymd:evaluation` — **PASS (engineering tier), identical to BASELINE**
```
{
  "suiteVersion": "0.1.0", "clinicalStatus": "draft", "scenarios": 22,
  "confusionMatrix": { "truePositive": 9, "trueNegative": 13, "falsePositive": 0, "falseNegative": 0 },
  "sensitivity": 1, "specificity": 1,
  "pendingClinicalReview": 22, "clinicalTargetsApproved": false, "clinicalTargetsMet": false,
  "configuredTargets": { "emergencySensitivityMinimum": null, "emergencySpecificityMinimum": null },
  "failures": [], "engineeringRegressionPassed": true, "clinicalReleaseGatePassed": false
}
```
`falseNegative: 0` — **no safety regression on the corpus.** `engineeringRegressionPassed: true`. `clinicalReleaseGatePassed: false` is the standing expected state (BASELINE), not a defect.

### `npm run build` — **PASS**
```
$ (time npm run build)
real  0m18.044s
EXIT=0
✓ built in 17.68s
```
Only the pre-existing chunk-size warning and a stale `caniuse-lite` notice.

### `npx tsc --noEmit -p tsconfig.json 2>&1 | grep -c "error TS"` — **103 · exactly baseline**
```
$ npx tsc --noEmit -p tsconfig.json > /tmp/qa/tsc.log 2>&1 ; grep -c "error TS" /tmp/qa/tsc.log
103

$ grep "error TS" /tmp/qa/tsc.log | sed 's/(.*//' | sort | uniq -c | sort -rn | head -9
     21 components/LibertyMD/LibertyMDApp.tsx
     16 tests/libertymd/clinical-policy.test.ts
      8 scripts/libertymd-live-validation.ts
      8 components/LibertyMD/LibertyMDChat.tsx      ← baseline 8, unchanged
      6 tests/libertymd/abandoned-chat-recovery.test.ts
      5 scripts/libertymd-clinical-evaluation.ts
      5 components/UnityCard/UnityCardDashboard.tsx
      4 scripts/libertymd-flow-simulation.ts
      4 components/LibertyMD/LibertyMDCareControls.tsx  ← baseline 4, unchanged
```
Per-file counts match BASELINE for every touched file. The three new client files (`LibertyMDEmergencyAlert.tsx`, `LibertyMDChatScroll.tsx`, `libertymd-severity.ts`) and `tests/libertymd/severity-mapping.test.ts` contribute **0** errors. **No new TypeScript errors.**

### Gate summary

| Gate | Baseline | Observed | New failure? |
|---|---|---|---|
| contracts | PASS | PASS (3 wf, 8 fixtures, 22 scenarios) | No |
| separability | PASS | PASS (2 of 3 checks run) | No |
| policy | PASS 15 | PASS **30** | No |
| recovery | PASS 5 | PASS 5 | No |
| simulations | PASS 10 | PASS 10 | No |
| evaluation | eng PASS, FN 0 | eng PASS, FN **0** | No |
| build | PASS | PASS | No |
| tsc | 103 / Chat 8 | **103 / Chat 8** | No |

**No new gate failures. No gate reported zero items checked.**

---

# Part 3 — Architectural rules (CONTEXT.md §3)

| # | Rule | Method | Verdict |
|---|---|---|---|
| 1 | The frontend never writes clinical tables | `grep -rn "from('libertymd_\|from(\"libertymd_" components/` → **no matches**. Every client path goes through `supabase.functions.invoke('libertymd-care-proxy')`. | **PASS** |
| 2 | The proxy is the sole clinical writer and the sole decision-maker about what is persisted | Service-role client is created in exactly one place (`lib/context.ts:42`). All clinical writes are in `lib/consultations.ts`, `lib/safety.ts`, `lib/telemetry.ts`, `lib/profiles.ts` and the `actions/`. The decomposition **strengthens** this rule rather than weakening it: `saveSafetyEvent` is called before any interview or diagnosis decision on every screened turn (`send-message.ts:292`, `save-demographics.ts:118`), so a diagnosis failure cannot lose a safety verdict; report/withhold/escalate remain `decideReportOutcome` in the proxy; `missing_slots` is still recomputed authoritatively in `lib/slots.ts`. No decision moved into n8n. | **PASS** |
| 3 | n8n is stateless inference — JSON in, JSON out, no DB writes | All four `postJson` call sites send only `{message, history, patient, filled_slots, missing_slots, target_slot, turn_count, intermediate_diagnoses}` and consume the response. No credentials, ids or table names are sent. Nothing in the workflows is invoked to write; `noPayloadRetention: true` on all three (contract gate). The new breaker sits *below* the safety decision inside `postJson`, so it changes transport timing only. | **PASS** |
| 4 | Identity comes from the JWT; never trust a client-supplied user id | `lib/context.ts:38–40` resolves `user` from the `Authorization` header via the anon client. `grep -rn "payload.user_id\|body.user_id" supabase/functions/libertymd-care-proxy/` → **no matches**. `RequestPayload` has no `user_id` field. Every read filters `.eq('user_id', ctx.user.id)`; `assertConsultationOwned` adds an explicit assertion at write time. | **PASS** |
| 5 | No PHI in telemetry, logs, client payloads or error strings; numerics bucketed | Telemetry properties are all categorical/count (`region`, `is_anonymous`, `turn_count`, `source`, `reason`, `patient_relationship`, `consent_version`, `access_status`, `confidence_score`, `evidence_score`) — no symptom text. Every new log line is deliberately message-free, with comments saying so (`send-message.ts:214–223`, `n8n-client.ts:325–331`, `consultations.ts:79–84`); `n8nBreakerSnapshot()` carries stages, counts and durations only. `classifyGuardrailFailure` derives `timeout` vs `transport` from `error.name` rather than from message text, and `guardrailTransportFailureResult` records `{screened, failure, severity}` with no error string. n8n payload is the trimmed `patientPayload` (name/age/sex). **Residual risks, all pre-existing and not introduced here:** (a) `errorResponse` still echoes the raw thrown message to the client (`lib/errors.ts:32–37`) — the code names this as P0-12's job and explicitly declines to fix it in-lane, which is the correct call for lane hygiene but leaves the hole open; (b) `console.error('LibertyMD guardrail/interview/diagnosis unavailable', error)` logs whole error objects — for `fetch`/abort errors these carry no request body, but a Postgres error reaching `errorResponse` could carry column detail; (c) `addIdentityEvent(..., { reason: cleanMessage(mergeError.message) })` (`actions/identity.ts:52`) puts a DB error message into an events table. `confidence_score`/`evidence_score` are raw numerics, not bucketed — arguably not PHI. | **PASS (with residuals noted)** |
| 6 | The home footer ribbon is frozen | Diff touches no `Footer` component and no home surface. | **PASS** |

**No architectural rule is violated by this batch.** Rule 2 is measurably better protected after the decomposition than before it.

---

# Part 4 — Regressions the ACs do not mention

Ordered by CONTEXT.md's cost ordering.

## 4.1 · Emergency detection failing to fire, or emergency guidance not reaching the user

**Detection: intact.** Verified from three directions.
- `runGuardrail` (`lib/safety.ts:85`) runs `detectDeterministicEmergency` **before any transport**, so the deterministic screen is unaffected by timeouts, the breaker, or an n8n outage. `clinical-policy.ts` is byte-identical (`git diff` empty) — no pattern, threshold or negation rule changed.
- The screen now runs on **more** turns than before, not fewer: turn 1 (unchanged), every `send_message` turn **including the capped 16th** (`send-message.ts:276–280` — the guardrail is deliberately not skipped when the interview is over), and now the demographics turn.
- Corpus: FN **0** across all emergency scenarios, sensitivity 1.0. `test:libertymd:policy` still force-ends the ACS, jaw-pain, surgical-abdomen and low-SpO₂ fixtures.
- The turn-1 budget widening (2 s → 10 s) can only *increase* the share of turns where the LLM guardrail's verdict is actually used. Direction of change is toward sensitivity.

**Guidance reaching the user: two real holes.**
- **Defect 1** — a `force_end` on the demographics turn is swallowed by both clients. Currently unreachable through shipped UI (no client sends free text on that turn), but the proxy is a public HTTP surface and P1-01 makes it reachable by design.
- **Defect 6** — the whole P0-18/19/20/23 viewport cluster is applied to `/liberty-md/chat` only. `/liberty-md` (`LibertyMDApp`) is a live consult route that still appends emergency copy to a scrolling transcript — i.e. the 20% `emergency_stopped` below-the-fold failure P0-18 exists to eliminate is only half eliminated.

## 4.2 · Sensitive data leaving its intended store

Nothing new. See Part 3 rule 5. The batch **improves** this: coarse `timeout|transport` classification instead of error strings, message-free invariant logs, and `n8nBreakerSnapshot()` designed PHI-free with a test asserting it (`P0-11 AC4: breaker state is observable and carries no PHI` — in the suite that does not run, Defect 5).

## 4.3 · Loss of user input

No regression found, and one improvement.
- `send_message` persists the user's message **before** the guardrail/interview calls, so a holding state or a 503 cannot lose it; the client also restores the draft (`LibertyMDChat:781 setInput(message)`).
- On the demographics turn, volunteered free text is retained as its own message **before anything can fail** (`save-demographics.ts:99–104`), and the pre-existing `demographics` row shape is untouched.
- `holdingState()` does not consume the turn and writes nothing to the transcript.
- Pre-existing, unchanged, worth recording: on a manual retry after a failed send, a fresh `client_message_id` is generated, so the server's `client_message_id` dedupe does not cover it and a duplicate user row is possible. Not caused by this batch.

## 4.4 · Can a technical failure now render with emergency or clinical styling? Can a clinical caution render as a technical fault?

**Technical → clinical: yes, three ways.** Defect 2 (turn-1 `acknowledgement()` writes a clinical caution sentence into the transcript because of a socket), Defect 3 (transport-failure copy in amber caution chrome), Defect 4 (`emergencyDetail` can put technical copy inside the red `role="alert"` emergency panel). All three are the exact defect class P0-14f and P0-16 were written to close.

**Technical → emergency, second door:** `mapMessages` maps **any** `message_type === 'safety'` row to `kind: 'emergency'` → red bubble. `send-message.ts` writes `'safety'` for `clinical_review_needed`, the turn-cap close and the off-topic stop — none of which is a `force_end`. Pre-existing, unchanged by the diff, but it is what makes P0-16 AC4's unreachability claim false at the product level.

**Clinical → technical: not reachable.** I checked the other direction specifically, because `TECHNICAL_SAFETY_SOURCES` keys on an n8n-supplied `source` string:
```
$ grep -o 'source[^,}]\{0,40\}' definitions/libertymd-guardrail-workflow__9qeE6tUcEY74OYV8.json | sort -u
source
source: 'deterministic'
source: 'llm'
```
Neither value is in `TECHNICAL_SAFETY_SOURCES`, so a genuine `high_risk_continue` from n8n maps to `caution`, never to `technical`. The decision to exclude generic `'error'`/`'timeout'` from that list (documented at `lib/types.ts:148–161`) is what prevents it, and it is the right call. **PASS on this one.**

## 4.5 · Other regression checks run and clear

- **Action coverage:** all 13 actions dispatch identically; unknown actions still fall through to 400 (`Map` lookup, no prototype chain).
- **Turn-count semantics:** the demographics turn still does not increment `turn_count` (unchanged); its `safety_events` row shares `turn_count` with turn 1 and is distinguished by `source`/`created_at` — documented, and it does not corrupt the turn-cap arithmetic.
- **Never-downgrade:** `save-demographics.ts:187–189` writes `safety_state` only when this turn escalated, so an unscreened or clean demographics turn cannot silently overwrite turn 1's `high_risk_continue`. Correct, and easy to have got wrong.
- **Lease handling:** `send_message`'s `finally` still clears the lease on every exit path including the new holding-state returns.
- **`resolveLibertyMDResumeStatus`:** unchanged; still resumes a transport-failure consult at `high_risk`. Recovery gate green.
- **Scroll trigger parity:** the `transcriptRevision` effect keeps the old dependency list and adds `error`/`safetyNotice`, so the trigger is a superset — only the timing moved.

---

# Numbered defects

Ordered by severity. Each is precise enough to act on.

### Defect 1 — BLOCKING (safety) · P0-14d AC2 · a `force_end` on the demographics turn never reaches the user
`components/LibertyMD/LibertyMDChat.tsx:643–678` and `components/LibertyMD/LibertyMDApp.tsx:682–707`. Both `submitDemographics` implementations ignore `data.emergency` / `data.state === 'emergency_stopped'` and unconditionally `setPhase('intake')` + render `data?.next_question || 'When did this symptom begin?'`. On a `force_end` the proxy returns no `next_question`, so the user who described crushing chest pain is shown the fallback interview question; their next answer 409s with *"Consultation cannot accept answers in emergency_stopped"* rendered in an amber box.
**Fix:** handle `data.emergency` exactly as `applyWorkflowResult` / `sendAnswer` already does — emergency message first, `setPhase('emergency_end')`, no interview question — in both files.
**Note on scope:** the ticket-spec's P1-01 block assigns this fix to P1-01 as a mandatory AC0. P0-14d shipped the server half that makes the hole real, so I am recording it against P0-14d AC2, which says in plain words "emergency copy precedes everything, including the interview question". Reachability today is limited to direct HTTP callers of the proxy, which is a mitigation, not a fix.

### Defect 2 — BLOCKING (safety) · a network failure writes a clinical caution into the clinical transcript
`supabase/functions/libertymd-care-proxy/actions/start-consultation.ts:20–26, 123`. `acknowledgement(message, guardrail)` appends *"I also noticed details that deserve extra caution, so I will keep checking for urgent warning signs."* whenever `risk.status === 'high_risk_continue'`. After P0-14f, a guardrail **transport failure** produces exactly that status — so a socket error causes a persisted assistant message (`message_type: 'demographics'`) telling the patient something about their body. This is the `error_fail_cautious` defect, still live, in a place the severity taxonomy cannot reach because it is prose inside a persisted message rather than a rendered notice.
**Fix:** branch `acknowledgement` on the derived severity (or on `isTechnicalSafetySource(guardrail.source)`), not on `status`; emit no clinical caution for a technical source.

### Defect 3 — BLOCKING · P0-14f AC1/AC2, P0-16 AC2/AC3, P0-14e AC3 · the four-severity mapping is not wired to any UI
`components/LibertyMD/libertymd-severity.ts` and the `LibertyMDSeverityNotice` / `LibertyMDSafetyNotice` / `LibertyMDRequestErrorNotice` components in `LibertyMDCareControls.tsx:38–178` are **imported by nothing except the test**:
```
$ grep -rn "LibertyMDSeverityNotice\|LibertyMDSafetyNotice\|LibertyMDRequestErrorNotice\|libertymd-severity" components/ tests/ | grep -v LibertyMDCareControls.tsx | grep -v 'libertymd-severity.ts:'
tests/libertymd/severity-mapping.test.ts:51,53,54,111,142,143,156,183,198,202,211,233,249,262,375,376,377,380
```
The amber boxes the ticket exists to remove are all still rendering: `LibertyMDChat.tsx:1072–1076` (safety notice) and `:1099–1103` (error), `LibertyMDApp.tsx:1156–1160` and `:1171–1175`. Net user-visible effect of P0-14f + P0-16 today: the *words* changed; the *chrome* did not. A transport failure still reads as a health caution.
**Fix:** the two-step adoption written out in `LibertyMDCareControls.tsx:150–178` — hold `LibertyMDSafetyNoticeContent | null` in state, set it from `libertyMDSafetyNoticeFromResponse(data)`, render `LibertyMDSeverityNotice` and `LibertyMDRequestErrorNotice`. In both clients.

### Defect 4 — MAJOR (safety) · P0-16 AC4 · emergency chrome is still reachable from non-`force_end` signals
Two doors, neither closed by the proven mapping function:
- **(a)** `LibertyMDChat.tsx:399–405` maps any `message_type === 'safety'` row to `kind: 'emergency'`, styled red at `:1048`. `send-message.ts` writes `'safety'` for `clinical_review_needed` (`:479`), the turn-cap close (`:181`) and the off-topic stop (`:337`). A "please continue with a licensed clinician" message therefore wears emergency clothing. Same ladder in `LibertyMDApp.tsx:1128–1137`.
- **(b)** `LibertyMDChat.tsx:936–938`: `emergencyDetail` falls back to `safetyNotice`, which can hold the *technical* transport-failure copy from an earlier turn (`applyWorkflowResult`'s emergency branch never clears it). That text then renders inside the red `role="alert" aria-live="assertive"` panel.
**Fix:** (a) introduce a distinct message kind for non-emergency `safety` rows, or drive the bubble from `severityForSafetySignal` rather than `message_type`; (b) clear `safetyNotice` when entering `emergency_end`, and never fall back to it for emergency detail.

### Defect 5 — MAJOR (process/safety) · `tests/libertymd/n8n-breaker.mts` (17 tests) has never executed, and fails when made to
Not referenced by any npm script, gate or other test:
```
$ grep -rn "n8n-breaker\|proxy-doubles" package.json scripts/ tests/ .github/
tests/libertymd/n8n-breaker.mts:11: * See tests/libertymd/support/proxy-doubles.mts for why these files are `.mts`.
tests/libertymd/n8n-breaker.mts:39:} from './support/proxy-doubles.mts'
```
And it cannot run even if invoked, because `tests/libertymd/support/proxy-doubles.mts:6` contains the literal `**/*.ts` inside a block comment — the `**/` **closes the comment early**:
```
$ deno test --no-config tests/libertymd/n8n-breaker.mts
error: SyntaxError: Expression expected
  |
6 |  * The repo's `tsconfig.json` includes `**/*.ts` and cannot be edited from this
  |                                             ~
    at .../tests/libertymd/support/proxy-doubles.mts:6:45
```
The file's own header asserts "Deno runs and type-checks `.mts` natively … **Verified both ways**". It was not. With the comment repaired in a scratch copy:
```
$ deno test --no-config --allow-env tests/libertymd/n8n-breaker.mts
TS2349 [ERROR]: This expression is not callable. Type 'never' has no call signatures.
      releaseProbe?.()   at tests/libertymd/n8n-breaker.mts:181:7
error: Type checking failed.

$ deno test --no-config --no-check --allow-env tests/libertymd/n8n-breaker.mts
…
§safety negated phrasings still do not fire with every breaker open ... FAILED
error: Error: must not force-end on a negated phrasing: my father had chest pain last year: expected false, got true
FAILED | 16 passed | 1 failed (23ms)
```
Three distinct problems: (i) not wired to a gate; (ii) a syntax error and a type error, so it could not have been run by its author; (iii) the one test that does fail is a **safety** test. That last one is a **pre-existing** edge-screen limitation, not a regression: `clinical-policy.ts` is unchanged in this diff and has no negation or family-history handling (BASELINE and CONTEXT both record that the edge screen is narrow and that the n8n guardrail's past-tense family-history suppression has not been ported — that is P0-14a, unshipped). So `"my father had chest pain last year"` genuinely force-ends at the edge today. Attribute the false positive to P0-14a; attribute the fact that nobody knew to this batch.
**Fix:** replace `**/*.ts` in both `.mts` files with a non-terminating spelling; fix `releaseProbe`'s type; register the suite in a gate (the `import './severity-mapping.test.ts'` trick used for P0-16 is a precedent, or add a named script); then either fix the edge screen's negation or mark that assertion as a known P0-14a gap with an explicit `// TODO(P0-14a)` and a passing negative expectation.

### Defect 6 — MAJOR · P0-18 AC1/AC3 (and P0-19/20/23 by extension) · the viewport cluster is applied to only one of two live consult surfaces
`App.tsx:202–211` routes `/liberty-md` → `LibertyMDApp` and `/liberty-md/chat` → `LibertyMDChat`. `LibertyMDApp` runs a complete consult (`invokeCareProxy` for `start_consultation`, `save_demographics`, `send_message`, `release_report`) and reaches `phase === 'emergency_end'` at `:617–623`, where emergency copy is an appended transcript bubble (`:1128–1137`) with no pinned overlay, no scroll anchoring, no jump pill and no bottom clearance. For a safety-grade ticket, "fixed on one of the two surfaces that render emergency instructions" is not done.
**Fix:** either apply `LibertyMDEmergencyAlert` + `useLibertyMDChatScroll` to `LibertyMDApp`, or retire/redirect `/liberty-md`'s consult path so there is one surface. If the intent is that `/liberty-md` is a landing page and `/liberty-md/chat` is the consult, say so explicitly and remove the consult code from the landing route — an unreachable-but-present emergency path is a trap for the next lane.

### Defect 7 — MAJOR · P0-11 AC3 · the calm holding state never reaches the user; the client retries 3× per turn instead
`components/LibertyMD/LibertyMDChat.tsx:384–392, 752–796`. `invokeCareProxy` throws on `functionError` for any non-2xx and never parses the response body, so the 503 holding state's `holding`, `severity: 'technical'`, `retry_after_ms` and calm copy are all discarded. `isRetryable` returns true for `status >= 500`, so a downed stage produces 3 attempts (1 s + 3 s backoff) per send and then a generic amber error — one alarming event per turn, which is precisely item 17.4's symptom. The message string reaching `setError` is typically Supabase's *"Edge Function returned a non-2xx status code"*, which also names an internal component (P0-12 AC2).
**Fix:** in `invokeCareProxy`, read the response body on non-2xx (`FunctionsHttpError.context.json()`); if `holding === true`, do not retry, render the supplied `message` as `severity: 'technical'`, and re-enable send after `retry_after_ms`.

### Defect 8 — MINOR · P0-13 AC4 · two consultation writes bypass the ownership invariant
`actions/save-demographics.ts:123–134` and `:190` update `libertymd_consultations` with `.eq('id', consultation.id)` and **no** `.eq('user_id', …)`, bypassing `updateOwnedConsultation`. No reachable violation exists (the row was fetched via `getOwnedConsultation`), which is why AC4 passes — but this is exactly the "ownership lives in a different statement several dozen lines earlier" pattern that `updateOwnedConsultation` was written to end, and P0-13's design says the invariant is asserted rather than assumed. `actions/start-consultation.ts:71–78` and `actions/report.ts` do filter `user_id` but still hand-roll the update.
**Fix:** route all four through `updateOwnedConsultation`.

### Defect 9 — MINOR · P0-13 AC5 · no test attempts any P0-13 invariant violation
```
$ grep -rn "assertTurnWithinCap\|assertConsultationOwned\|InvariantViolation\|handleSendMessage\|message_type_enum\|assertInferenceAllowed\|PostEmergencyInference" tests/ scripts/
tests/libertymd/support/proxy-doubles.mts:21: * `handleSendMessage` is where three of P0-13's four invariants are actually
```
The 294-line doubles harness was built for these tests — its header says so — and the test file was never written. AC5 requires four tests: turn cap, post-emergency inference, `message_type` enum, ownership.
**Fix:** write `tests/libertymd/proxy-invariants.mts` (or `.test.ts`) against `proxy-doubles.mts`, asserting for each that the call throws and that the rejected write **did not happen**; register it in a gate.

### Defect 10 — MINOR (ticket defect) · P0-18 AC7, P0-19 AC5, P0-23 AC3 demand automated/browser verification that no harness in this repo can provide
There is no DOM/component test harness and no browser. AC7 ("automated test asserts in-viewport at render for all four widths") is therefore unachievable as written, not merely unmet. **Fix:** either add a jsdom/Playwright harness as its own ticket and make these ACs depend on it, or restate them as documented manual verification with recorded evidence. Do not let them stand as ACs nobody can close.

### Defect 11 — MINOR (ticket defect) · P0-23 AC2 depends on unshipped P0-21
"Padding adapts when the action bar (P0-21) is present or absent" cannot be verified because P0-21 has not shipped. The `ResizeObserver` on `footerRef` is a reasonable forward-compatible mitigation. **Fix:** move AC2 to P0-21, or restate it as "the transcript re-anchors when footer height changes", which *is* verifiable and *is* implemented.

---

# What I could not verify

1. **Any actual on-screen behaviour.** No browser, no device, no DOM harness. Every P0-18/19/20/23 verdict marked PASS is reasoned from source (positioning model, containing blocks, observer wiring, event attribution) and explicitly not browser-verified. The five UNTESTABLE viewport ACs — P0-18 AC2, P0-19 AC4/AC5, P0-23 AC3 — are the honest gaps.
2. **The cross-product foreign-key check** (`separability`, and hard rule 2 / the Dr. Jivi separation decision) is `SKIPPED` without `--with-db` + `SUPABASE_DB_URL`. Not run here, not run in BASELINE.
3. **Whether L0-5 is behaviour-neutral.** The whole batch is one uncommitted working tree; there is no L0-5-only revision to compare, and the diff demonstrably contains deliberate behaviour changes from other tickets.
4. **Live n8n behaviour.** `test:libertymd:db` and `test:libertymd:live` are NOT RUN (per BASELINE). Every timeout, breaker and outage claim is verified against stubs or by reading code, never against the real workflows. P0-11's DoD+ ("verified by taking n8n offline") and P0-14e's timeout-on-turn-1 verification are unclosed.
5. **Clinical correctness of anything.** See the REQUIRES EXPERT REVIEW table. `clinicalReleaseGatePassed: false` and `pendingClinicalReview: 22` remain the standing state.
6. **The Gemini → OpenAI provider switch** on the clinical inference path, which BASELINE flags as needing business-owner confirmation, is still unrecorded in `DECISIONS.md`. Out of scope for this batch; still open.

---

# Recommendation

**FAIL — do not close this batch.** The proxy decomposition (L0-5) and the server-side safety, invariant and reliability work (P0-14d AC1/3/4/5, P0-14e AC1/2/4, P0-13 AC1–4, P0-11 AC1/2/4/5) are good work: gates are green, TypeScript is unchanged at 103, no architectural rule is broken, `falseNegative` is still 0, and rule 2's failure-domain separation is stronger than before.

What blocks is a consistent shape: **three P0 safety tickets and one reliability ticket landed their server half and skipped their client half**, and the two test suites the ACs lean on for proof either never run (Defect 5) or were never written (Defect 9). Defects 1, 2, 3 and 7 are all the same failure — a correct decision computed on the server and then discarded before it reaches a person. Defects 1–4 must be fixed before release; 5 and 9 must be fixed before this batch can be said to have been *tested* at all; 6 and 7 before P0-18/P0-11 can be called done.
