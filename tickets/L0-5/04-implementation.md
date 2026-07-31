# L0-5 — Decompose `libertymd-care-proxy/index.ts` · Implementation notes

**Date:** 2026-07-30
**Type:** pure structural refactor. Zero behaviour change.
**Scope:** `supabase/functions/libertymd-care-proxy/` only.

---

## 1. What was done

`index.ts` went from **1508 lines** to **80 lines** — CORS/method handling, request
parse, context creation, dispatch, and the single top-level catch. Nothing else.

Everything else moved. The move was mechanical: function bodies were copied
verbatim, and the only edits were (a) turning the per-request closures over
`user` / `db` / `isAnonymous` into an explicit `ProxyContext` first parameter, and
(b) adding imports. One block was re-indented (the `send_message` lease
`try`/`finally`, which was mis-indented in the original).

### Module layout produced

```
libertymd-care-proxy/
  index.ts                     80   dispatch only
  clinical-policy.ts          147   untouched          → Lane B
  session-recovery.ts          37   untouched          → Lane B
  actions/
    bootstrap.ts               23   bootstrap
    abandon-resume.ts          89   abandon_consultation, resume_consultation
    start-consultation.ts     151   start_consultation (+ acknowledgement copy)
    save-demographics.ts      106   save_demographics                    → Lane F
    send-message.ts           333   send_message                         → Lane A
    report.ts                  69   release_report + shared releaseReport()
    identity.ts               105   prepare/complete_account_merge,
                                    sync_identity, record_identity_event  → Lane F
    reads.ts                   31   get_history, get_consultation
  lib/
    types.ts                  108   RequestPayload, ConsultationRow, PatientRow,
                                    GuardrailResult, InterviewResult, ProxyAction
    config.ts                  18   webhook env, CONSENT_VERSION, MAX_TURNS
    context.ts                 48   ProxyContext + JWT identity + service-role client
    errors.ts                  23   jsonResponse + errorResponse (failure taxonomy) → Lane C
    n8n-client.ts             147   postJson, normalizeObject, runInterview,
                                    runDiagnosis, parseDiagnosis              → Lane C
    safety.ts                 103   runGuardrail + saveSafetyEvent            → Lane B
    slots.ts                   56   CLINICAL_SLOTS, CORE_SLOTS,
                                    sanitizeSlotUpdates, calculateMissingSlots → Lane A
    telemetry.ts               45   addProductEvent + addIdentityEvent        → Lane E
    profiles.ts               110   ensureProfile, ensureSelfPatient,
                                    getOrCreateSelfPatient, getOwnedPatient
    consultations.ts          170   getOwnedConsultation, getHistory, addMessage,
                                    replayCompletedTurn, saveDiagnosticRun,
                                    historySummary
```

1896 lines total across 20 files, up from 1508 in one — the delta is imports,
type declarations that were previously implicit in closure scope, and doc
comments recording the architectural rules each module carries.

### Deviations from the LANES.md target, and why

Three modules exist that the target did not name. All three are shared code that
had to live *somewhere*; putting them inside an action module would have made one
lane's file a dependency of four other lanes' files.

| Added module | Why |
|---|---|
| `lib/context.ts` | The original was one giant request closure. Every helper needs `user`, `db`, `isAnonymous`. This is the seam that made the split possible at all. |
| `lib/profiles.ts` + `lib/consultations.ts` | The db helpers (`ensureProfile`, `getOwnedConsultation`, `addMessage`, `saveDiagnosticRun`, …) are used by 6+ action modules. Sole-clinical-writer rule means they cannot be duplicated. |
| `lib/utils.ts` | `cleanMessage`, `limitConsultationMessage`, `sha256`, `timed`, `patientPayload` — pure, used everywhere, owned by nobody. |
| `lib/types.ts` | Shared row/result interfaces. Keeps `ProxyAction` next to the dispatch map's key type. |

`releaseReport` lives in `actions/report.ts` and is imported by `actions/identity.ts`
(sync_identity and complete_account_merge both release). Kept there rather than in
`lib/` so the report-gate decision stays visibly in one place.

`runGuardrail` is in `lib/safety.ts`, not `lib/n8n-client.ts`, even though it makes
an n8n call — the guardrail verdict, its fail-cautious fallback and the
deterministic edge screen are one safety decision, and Lane B needs to own all of
it. `n8n-client.ts` owns transport (`postJson`, timeouts) which Lane C changes in
P0-11; safety.ts calls into it.

### One deliberate implementation choice worth flagging

The dispatch table is a `Map`, not an object literal. With a plain object,
`HANDLERS[payload.action]` for `action: "toString"` or `"constructor"` resolves
against `Object.prototype` and dispatches a non-handler — a behaviour change
versus the original `if`-chain, which returned 400. `Map` has no prototype
lookup. Verified live: see §3.4.

---

## 2. Architectural rules preserved

| Rule | Where it now lives |
|---|---|
| 1 · Frontend never writes clinical tables | unchanged — still one edge function |
| 2 · Proxy is sole clinical writer **and sole decision-maker on persistence** | `lib/context.ts` creates the only service-role client; every write helper takes `ctx`. `decideReportOutcome` still runs in `actions/send-message.ts`; `calculateMissingSlots` still recomputes authoritatively in `lib/slots.ts` |
| 3 · n8n is stateless inference | `lib/n8n-client.ts` and `lib/safety.ts` contain no db access. Enforceable by inspection now: neither imports `context.ts` for writes except `saveSafetyEvent` |
| 4 · Identity from the JWT | `createProxyContext` resolves `user` from the Authorization header via the anon client. No action module reads a user id from the payload |
| 5 · No PHI in telemetry/logs/errors | no telemetry payload or log string changed; string-literal parity verified (§3.2) |

**Failure-domain separation (the reason rule 2 matters most) is intact.**
`saveSafetyEvent` is still called before any interview/diagnosis branch in
`send_message`, and it is still in a different module from the diagnosis path.
A diagnosis failure still cannot lose a guardrail verdict.

---

## 3. Verification

Run on the mounted repo with `PATH=/tmp/deno/bin:$PATH`, deno present.

### 3.1 Gates — `npm run test:libertymd:ci`

| Gate | Before | After |
|---|---|---|
| contracts | PASS · 3 schemas, 8 fixtures, 3 workflows | PASS · identical |
| separability | PASS · 2 checks run, FK check SKIPPED | PASS · identical |
| policy | ok · 15 passed, 0 failed | ok · 15 passed, 0 failed |
| recovery | ok · 5 passed, 0 failed | ok · 5 passed, 0 failed |
| simulations | PASS · 10/10 loops | PASS · 10/10 loops |
| evaluation | TP 8 · TN 12 · FP 0 · **FN 0** · sens 1.0 · spec 1.0 · `engineeringRegressionPassed: true` | **identical** |
| exit code | 0 | 0 |

`clinicalReleaseGatePassed: false` and `pendingClinicalReview: 20` unchanged —
the standing expected state per BASELINE.md, not a defect.

**Stronger than "both green":** `diff` of the two full CI logs is empty once
per-test microsecond timings are normalised out. Byte-identical output.

### 3.2 Move fidelity — mechanical, not eyeballed

Three automated comparisons of the pre-refactor file against the new tree:

1. **String-literal parity.** Every string literal in the old `index.ts` occurs
   the **exact same number of times** in the new tree, and the new tree
   introduces **zero** new literals (excluding import paths). This covers all
   table names, column names, event names, status values, error messages and
   patient-facing copy. Zero differences.
2. **Numeric-literal parity.** Zero differences — timeouts (2 000 / 10 000 /
   25 000 / 55 000 ms), thresholds (score ≥ 50, turn ≥ 6, confidence, `MAX_TURNS`
   15), retention windows (7 / 30 days), slice limits. All identical.
3. **Line-level coverage.** Of 1403 logic lines in the old file, 149 are not
   present verbatim in the new tree. Every one is an expected mechanical change:
   a declaration header (`const ensureProfile = async () => {` →
   `export async function ensureProfile(ctx)`), a dispatch `if (payload.action === …)`,
   or a call site threading `ctx`. No clinical logic line, field assignment,
   status string or db column is among them. Reviewed individually.

### 3.3 TypeScript

```
npx tsc --noEmit -p tsconfig.json  |  grep -c "error TS"
before: 103        after: 103        baseline: 103
```

`diff` of the two full tsc outputs is empty — same errors, same files, same
lines. Note `tsconfig.json` **excludes `supabase/`**, so the proxy does not
contribute to that 103 either way; the real typecheck for it is:

```
deno check --no-config supabase/functions/libertymd-care-proxy/index.ts
→ exit 0   (whole module graph, incl. remote supabase-js + std types)
```
The pre-refactor file also exits 0. No new type errors, no import-resolution
errors the deployer's bundler would hit.

### 3.4 Live HTTP parity smoke

Both entrypoints run under `deno run --allow-net --allow-env` and probed with
curl. Every response body and status code is **identical**:

| Probe | Old | New |
|---|---|---|
| `GET /` | 405 `Method not allowed` | same |
| `OPTIONS /` | 200 `ok` + CORS | same |
| POST, no `Authorization` | 401 `Authentication required` | same |
| POST, malformed JSON | 500 `Unexpected token 'o'…` | same |
| POST, no Supabase env | 503 `LibertyMD backend is not configured` | same |
| POST `action:"nonexistent"` (with stub auth) | 400 `Invalid action` | same |
| POST `action:"toString"` | 400 `Invalid action` | same |
| POST `action:"constructor"` | 400 `Invalid action` | same |
| POST `action:"__proto__"` | 400 `Invalid action` | same |
| POST `action:""` | 400 `Invalid action` | same |

The last four are the prototype cases the `Map` protects. With an object literal
`toString` and `constructor` would have dispatched garbage instead of 400.

Not covered by any of the above: the authenticated happy paths for the 13
actions. There is no test harness that exercises them (no local Supabase stack
in `:ci`, `test:libertymd:db` and `:live` are both NOT RUN per BASELINE.md).
The fidelity checks in §3.2 are the substitute, and they are strong — but the
first real deploy should be smoke-tested with `npm run test:libertymd:live`.

### 3.5 Backup

`supabase/.l0-5-backup/index.ts.pre-L0-5.bak` — the 1508-line original, outside
`supabase/functions/`, so neither the separability walk nor `tsc` sees it.
Delete once this has been live for a release.

---

## 4. Deliberately left alone

- `clinical-policy.ts` and `session-recovery.ts` — byte-identical. No import-path
  change was needed; the action modules import `../clinical-policy.ts`.
- The two drifted deterministic emergency screens. The edge screen still has 5
  rules and the n8n guardrail still has more. **That is P0-14a, Lane B.** Moving
  `runGuardrail` was tempting territory; nothing was changed.
- `test:libertymd:db` and `:live` — not part of `:ci`, still NOT RUN.
- Timeout values, retry behaviour, circuit breaker. `lib/n8n-client.ts` has no
  retries and no breaker; the timeouts are still the hardcoded 2 s / 10 s / 25 s
  / 55 s. That is **P0-11, Lane C**, and the module now exists for it to land in.
- `BASELINE.md` — not updated. Nothing regressed and nothing was fixed.

---

## 5. Defects noticed and NOT fixed

Recorded here, not acted on. Each belongs to a lane.

1. **Telemetry event names have no `LibertyMd ` prefix.** CONTEXT.md §5 says every
   event is prefixed (the Mixpanel project is shared across six products, so the
   prefix is load-bearing) and there is "one `emitEvent()` helper". The proxy
   writes bare names — `consultation_started`, `demographics_saved`,
   `emergency_stopped`, `report_gate_reached`, `clinical_review_needed`,
   `report_released_guest`, `report_saved_google` — straight into
   `libertymd_product_events`, and there is no Mixpanel fan-out at all. So the
   convention is currently aspirational, and "two sinks, one emit point" is
   one sink. **Lane E, P1-15/P1-16.** `lib/telemetry.ts` is now the single place
   to fix it.
2. **`emergency_stopped` telemetry carries a raw turn count, not a bucket.**
   `{ turn_count: turnCount }`. Rule 5 says numerics bucketed, never raw. Turn
   count is weak but non-zero re-identification surface, and `confidence_score`
   / `evidence_score` go out raw too in `report_gate_reached`. **Lane E.**
3. **Guardrail unavailability is dressed as a clinical caution.** On transport
   failure `runGuardrail` returns `risk_level: 'medium'`, `status:
   'high_risk_continue'` and the patient-facing string "The extended safety
   screen was unavailable. Seek urgent care if symptoms feel severe or
   dangerous." The consultation then flips to `high_risk`. Failing cautious on
   detection is correct (safety asymmetry), but the *user-visible severity* is a
   technical failure wearing clinical clothing — exactly the fourth-severity
   problem CONTEXT.md §4 says must not recur. The fail-cautious *state* and the
   *copy* should be decoupled. **Lanes B + D, interacts with P0-16.**
4. **`start_consultation` gives the guardrail a 2 s budget; `send_message` gives
   it 10 s.** The tightest timeout is on the very first message — the turn most
   likely to contain an untriaged emergency, and the only turn where the
   deterministic edge screen is the sole backstop. A 2 s n8n timeout on turn 1
   silently downgrades to `error_fail_cautious`. Plausibly deliberate (first
   paint latency), but it is an undocumented safety/latency trade. **Lane B or C.**
5. **`saveSafetyEvent` is not called on the `save_demographics` turn.** The
   guardrail does not run there at all — demographics text is never screened, and
   the safety state is inherited from turn 1. Adjacent to **P0-14b** (evaluate
   every turn).
6. **`profile` is destructured and never used** in `save_demographics`
   (`const { data: profile, error: profileError } = …`). Harmless; `deno lint`
   would flag it. Kept verbatim.
7. **The `send_message` `finally` clears the request lease even when the body
   threw**, which is correct, but the throw then hits the top-level catch and
   returns the raw `error.message` to the client with a 500. Some of those
   messages are internal Postgres errors. Rule 5 (no internals, no PHI in error
   strings) is at risk here. **Lane C, P0-12** — `lib/errors.ts` is the place.
8. **`errorResponse` maps by string equality on `'Consultation not found'`.**
   A typo anywhere turns a 404 into a 500. A typed error would be better.
   **Lane C, P0-12.**

---

## 6. For the lanes

Ownership is now file-level for five of six lanes, as LANES.md intended:

- **Lane A** — `lib/slots.ts`, `actions/send-message.ts`
- **Lane B** — `clinical-policy.ts`, `lib/safety.ts`
- **Lane C** — `lib/errors.ts`, `lib/n8n-client.ts`
- **Lane E** — `lib/telemetry.ts`
- **Lane F** — `actions/start-consultation.ts`, `actions/save-demographics.ts`,
  `actions/identity.ts`

Remaining shared surfaces to watch at merge: `lib/context.ts`,
`lib/consultations.ts`, `lib/profiles.ts`, `lib/types.ts`. These should mostly be
*read* by the lanes, not edited. A lane that needs a new db helper adds it rather
than reshaping an existing one. `index.ts` should only change when an action is
added or removed.
