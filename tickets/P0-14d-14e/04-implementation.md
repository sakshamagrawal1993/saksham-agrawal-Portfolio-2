# P0-14d + P0-14e — Implementation notes

**Date:** 2026-07-30
**Lane:** B (reprioritised to the front — both are P0, both found during L0-5)
**Scope:** `supabase/functions/libertymd-care-proxy/` + the clinical scenario corpus.
**Result:** all six `:ci` gates pass, exit 0. `falseNegative` **0**. TS errors **103** (baseline 103).

---

## 1. What each ticket turned out to be

### P0-14d — the gap is real, and it has two halves

**Verified first, as instructed.** `handleSaveDemographics` did not import `runGuardrail`
or `saveSafetyEvent` at all. Confirmed by grep of the pre-change file: the only n8n call on
that turn was `runInterview`. So there was one whole input-accepting, consult-advancing turn
with **no safety evaluation of any kind** and **no `libertymd_safety_events` row**. The
safety state was silently inherited from turn 1.

**But the second half matters as much, and it is the AC5 case.** As of today
*neither shipped client sends free text on this turn*:

| Client | Payload sent |
|---|---|
| `components/LibertyMD/LibertyMDChat.tsx:609` | `{ action, consultation_id, age, sex_at_birth }` |
| `components/LibertyMD/LibertyMDApp.tsx:688` | `{ action, consultation_id, age, sex_at_birth }` |
| `scripts/libertymd-live-backend-smoke.mjs:90` | same |

The message written to history is a **server-composed** string,
`Age 44; sex assigned at birth: male`. There is no user prose on that turn in the current UI.

So the honest finding is: *the guardrail was never called, and in today's UI there is also
nothing clinical to call it on.* Those are two separate facts and I did not let the second
one excuse the first, because:

1. **`payload.message` was already on `RequestPayload` and was silently discarded here.**
   The proxy is a public HTTP surface. Free text could already arrive on this turn — from a
   future client, a replayed request, or anything not the two React apps — and it would be
   dropped unread *and* unscreened. That is the actual exploitable shape of the gap.
2. **P1-01 will add a free-text field to this card.** "Value before ask" means the
   demographics step stops being a bare age/sex form. The screening path should be live
   before the field appears, not after.
3. A turn with no safety row is a turn nobody can audit. "Was this screened?" was
   unanswerable from the data.

**What I did not do:** I did not invent a guardrail call on the synthesised
`Age 44; sex assigned at birth: male` string. Sending that to n8n would add a 10 s
worst-case budget to the single highest-drop-off step in the funnel (35%, confirmed real
users) in exchange for exactly zero detection value. That would be safety theatre paid for
in abandonment.

### P0-14e — the budget inversion is real and worse than it reads

`start_consultation` passed `2_000` to `runGuardrail`; `send_message` used the `10_000`
default. The tightest budget sat on turn 1 — the turn most likely to carry an untriaged
emergency, and the only turn where the deterministic edge screen is the sole backstop.

Two things sharpen it beyond the L0-5 note:

- **The failure was silent and mis-severitied.** A 2 s abort does not surface as "we could
  not screen you". It falls into the `catch` and returns `high_risk_continue` /
  `error_fail_cautious` — a *clinical caution about the user's body* standing in for a
  network timeout. Measured directly (§3.3): a guardrail that answers in 3 s was being
  discarded and replaced with a fabricated medium-risk verdict.
- **The n8n side was never the constraint.** The contract gate reports the guardrail
  workflow's own timeout as **60 s** (`test:libertymd:contracts` → `"timeout": 60`). The
  edge function was aborting at 2 s a workflow it had granted 60. The 2 s was a
  first-paint-latency choice, not a transport reality.

---

## 2. Files changed

| File | Change |
|---|---|
| `lib/config.ts` | **New** `N8N_TIMEOUT_MS = { guardrail: 10_000, interview: 25_000, diagnosis: 55_000 }`, with the safety rationale as a doc comment. |
| `lib/safety.ts` | `runGuardrail` default timeout now `N8N_TIMEOUT_MS.guardrail`. **New** `unscreenedTurnResult()`. |
| `lib/n8n-client.ts` | `25_000` / `55_000` literals → config. |
| `actions/start-consultation.ts` | Dropped the `2_000` override. Turn 1 now uses the shared budget. |
| `actions/save-demographics.ts` | Guardrail + `saveSafetyEvent` on this turn; free-text retention; `force_end` branch; no-downgrade `safety_state` rule; `safety` added to the response. |
| `tests/libertymd/clinical-scenarios.v0.1.json` | +2 scenarios (1 positive, 1 negative control). |

**Backups:** `supabase/.p0-14de-backup/*.pre-P0-14de.bak` (all six files) plus
`ci-before.log`. `.bak` does not match the separability walk's `\.(ts|tsx|mjs|js)$` filter
and the directory is outside `supabase/functions/`, so neither the walk nor `tsc` sees it.
Follows the L0-5 convention. Delete after a release.

Nothing outside the manifest was touched.

### P0-14e · budgets

One number for the guardrail, used on every turn. AC1 asks for turn 1 ≥ later turns;
**equal** satisfies it with no residual difference to justify, which is the outcome I
wanted — a per-turn safety budget is a thing someone will eventually tune in the wrong
direction. The config comment states the rule explicitly: if turn 1 needs to feel faster,
the answer is a faster guardrail, a streamed acknowledgement, or optimistic rendering,
never a tighter safety budget on turn 1 than on turn 4.

`postJson` keeps its required `timeoutMs` parameter and `runGuardrail` keeps its optional
override — both are needed to test the boundary, and P0-11 (retries/breaker) lands there.
No call site passes an override any more (verified by grep, §3.5).

### P0-14d · screening the demographics turn

Order of operations, mirroring `send_message` because the invariants are the same:

1. Validate age/sex (unchanged, still deterministic 18–120).
2. Persist profile / patient / consent (unchanged).
3. Write the demographics history message (unchanged, byte-identical for existing flows).
4. **If free text was supplied, write it as its own user message** — before anything can
   fail. The user's input is sacred. A separate row rather than appended to the
   demographics line, so the existing flows' data shape does not move at all.
5. Guardrail and interview run **concurrently** — separate failure domains.
6. **`saveSafetyEvent` before any interview decision is acted on.** A guardrail verdict can
   never be lost to an interview or diagnosis failure.
7. `force_end` → emergency copy as the only assistant message, status `emergency_stopped`,
   `demographics_saved` + `emergency_stopped` events, early return. **No interview question
   is asked.**
8. Otherwise continue as before.

Three decisions worth flagging:

**The unscreened-turn row is not a pass.** When there is no free text, the turn still
writes a `libertymd_safety_events` row via `unscreenedTurnResult()`, carrying
`source: 'no_free_text_to_screen'` and `raw_result.screened: false`. `status`/`risk_level`
are CHECK-constrained on the table (`status in ('pass','high_risk_continue','force_end')`),
so a fourth status could not be invented without a migration — out of manifest and not
worth it. `source` and `crisis_type` are free text, so the disambiguation lives there. The
docstring says in terms: never read `status: 'pass'` alone as evidence a turn was
evaluated. This turns "was never screened" from an absence into a queryable fact.

**`safety_state` is never downgraded.** `save_demographics` reads
`consultation.safety_state?.status === 'high_risk_continue'` to pick the next status. Had I
written this turn's verdict unconditionally, a clean or unscreened demographics turn would
have **erased turn 1's high-risk state** — a safety regression introduced by a safety
ticket. `safety_state` is now written only when this turn itself escalates
(`high_risk_continue`), and `nextStatus` ORs the inherited and fresh verdicts. Case D in
§3.4 exists specifically to hold that line.

**`demographics_saved` still fires on the emergency path.** The demographics *were* saved.
Suppressing the funnel event would corrupt the 35%-wall measurement, which is the thing
this phase exists to learn about.

### Corpus

Two scenarios added (`demographics_turn_emergency`, `demographics_turn_negated_red_flag`).
AC4 only requires the positive; the negative control comes along because P0-14a's discipline
is that widening where the screen runs must be paired with a negation case, and because
screening a new turn is a new false-positive surface. Both annotated with the ticket id for
clinician review, per the existing `clinical_review` convention.

---

## 3. Verification

`cd /Users/sakshamagrawal/Documents/Projects/saksham-agrawal-Portfolio-2`,
`export PATH="/tmp/deno/bin:$PATH"`, deno 2.9.4.

### 3.1 `npm run test:libertymd:ci` — exit 0, six of six

| Gate | Before | After |
|---|---|---|
| contracts | PASS · 3 schemas, 8 fixtures, 3 workflows, suite valid (20) | PASS · identical, suite valid (**22**) |
| separability | PASS · 2 checks, FK SKIPPED | PASS · identical |
| policy | ok · 15 passed, 0 failed | ok · 15 passed, 0 failed |
| recovery | ok · 5 passed, 0 failed | ok · 5 passed, 0 failed |
| simulations | PASS · 10/10 loops | PASS · 10/10 loops |
| evaluation | `engineeringRegressionPassed: true` | `engineeringRegressionPassed: true` |
| **exit code** | **0** | **0** |

### 3.2 Clinical evaluation — the number that matters

```
                     before        after
scenarios              20            22
truePositive            8             9
trueNegative           12            13
falsePositive           0             0
falseNegative           0             0   ← non-negotiable, held
sensitivity           1.0           1.0
specificity           1.0           1.0
failures               []            []
engineeringRegressionPassed  true → true
clinicalReleaseGatePassed   false → false   (standing expected state)
pendingClinicalReview   20            22
```

**`falseNegative` is 0 and `falsePositive` is 0.** Sensitivity and specificity both stay
at 1.0 — the two new scenarios were absorbed without loosening or tightening detection.

> **BASELINE.md needs a deliberate update and I did not make it.** It is outside my
> manifest. The evaluation gate now legitimately reads TP 9 / TN 13 /
> `pendingClinicalReview` 22 / `scenarios` 22, because P0-14d AC4 mandates a corpus
> addition. Per BASELINE's own QA rule this is not a regression — that rule is
> `engineeringRegressionPassed` flipping false, or `falseNegative` rising above 0, and
> neither happened. Whoever owns BASELINE.md should fold in the new expected numbers so QA
> is not comparing against stale ones.

### 3.3 Typecheck

```
npx tsc --noEmit -p tsconfig.json | grep -c "error TS"
before: 103    after: 103    baseline: 103
```

`tsconfig.json` excludes `supabase/`, so the real typecheck for the proxy is:

```
deno check --no-config supabase/functions/libertymd-care-proxy/index.ts   → exit 0
```

Whole module graph, clean, before and after.

### 3.4 Behavioural probes

`:ci` cannot reach these paths — there is no local Supabase stack and `:db` / `:live` are
NOT RUN per BASELINE. Two throwaway deno harnesses were run and **deleted**; nothing was
added to the repo or to `:ci`.

**Timeout harness** — local HTTP stub with a controllable delay, 7/7 PASS:

```
PASS  guardrail budget is config                                    — 10000 ms
PASS  turn 1 budget >= later turns (14e AC1)                        — single shared value, no per-turn override remains
PASS  slow-but-answering guardrail is honoured                      — source=n8n status=pass after 3015 ms
PASS  old 2 s budget silently downgraded to error_fail_cautious     — source=error_fail_cautious status=high_risk_continue
PASS  timeout at new budget still fails cautious                    — source=error_fail_cautious status=high_risk_continue after 10006 ms
PASS  deterministic emergency short-circuits before transport       — source=edge_deterministic force_end=true in 0 ms
PASS  unscreened-turn verdict is CHECK-valid and distinguishable    — status=pass risk=low source=no_free_text_to_screen screened=false
```

Line 3 vs line 4 is the defect, demonstrated rather than argued: the *same* 3 s guardrail
response is honoured at the new budget and thrown away for a fabricated medium-risk verdict
at the old one. Line 5 is 14e AC3's internal half — a real timeout still fails cautious.
Line 6 confirms the deterministic screen is immune to the budget entirely, so turn-1
emergency detection never depended on it.

**Handler harness** — `handleSaveDemographics` against a stubbed service-role client and
stubbed webhooks, 17/17 PASS:

```
A · no free text (today's shipped payload)
PASS  safety_events row written on a no-free-text demographics turn  — 1 row, source=no_free_text_to_screen
PASS  row is marked unscreened, not a real pass                      — raw_result.screened=false
PASS  no guardrail n8n call, so no added latency at the 35% wall     — 0 calls
PASS  interview still proceeds normally                              — status=200 state=interviewing
PASS  safety_state left untouched by an unscreened turn

B · emergency free text on the demographics turn
PASS  force_end on the demographics turn                             — emergency=true state=emergency_stopped
PASS  deterministic screen caught it without n8n                     — source=edge_deterministic
PASS  safety_events row persisted for the turn                       — force_end=true
PASS  emergency copy precedes everything — no interview question     — 1 assistant msg, type=safety
PASS  consultation moved to emergency_stopped with the verdict stored
PASS  user free text retained in history (input is sacred)
PASS  demographics_saved still emitted alongside emergency_stopped

C · n8n returns high_risk_continue on free text
PASS  free text is screened through n8n at the full budget           — 1 call, source=n8n
PASS  fresh high_risk_continue escalates the consult                 — state=high_risk
PASS  escalation writes safety_state
PASS  caution surfaced to the client                                 — safety.status=high_risk_continue

D · turn 1 was high_risk, this turn screens clean
PASS  inherited high risk is preserved, never downgraded             — state=high_risk, no safety_state write
```

### 3.5 No inline budgets left

`grep` for `2_000|10_000|25_000|55_000` across the proxy returns only `lib/config.ts` and
one explanatory comment. All three `runGuardrail` call sites
(`start-consultation.ts:41`, `save-demographics.ts:111`, `send-message.ts:89`) pass no
timeout argument.

### 3.6 AC coverage

| AC | Where |
|---|---|
| 14d·1 guardrail on free text | `save-demographics.ts` step 5; §3.4 C |
| 14d·2 force_end terminates, emergency copy first | §3.4 B |
| 14d·3 `safety_events` row for the turn | §3.4 A and B |
| 14d·4 corpus scenario | `demographics_turn_emergency`; §3.2 |
| 14d·5 no-free-text case documented | §1, and the module docstring |
| 14e·1 turn 1 budget ≥ later turns | one shared value; §3.4 line 2 |
| 14e·2 budgets are config | `N8N_TIMEOUT_MS`; §3.5 |
| 14e·3 timeout fails cautious | §3.4 line 5 — **rendering half is NOT done, see §5** |
| 14e·4 corpus confirms no regression | §3.2, FN 0 / FP 0 |

---

## 4. Deliberately left alone

- **`clinical-policy.ts` and the two drifted deterministic screens.** Untouched. The edge
  screen still has 5 rules and the n8n guardrail has more. **That is P0-14a.** P0-14d
  widens *where* the existing screen runs; it does not touch *what* it matches.
- **P0-14b (run on every turn) and P0-14c (`raw_result` span logging).** Adjacent and
  tempting. `unscreenedTurnResult` writes a structured `raw_result` rather than `{}`, which
  is the shape P0-14c wants, but the matched-span logging for real firings is untouched.
- **`send_message`'s guardrail call.** Already had the correct budget; no change.
- **The unused `profile` destructure** in `save_demographics` (L0-5 defect 6). Still
  unused, still harmless, still verbatim. Out of ticket scope; fixing it would add diff
  noise to a safety file for a lint nit.
- **`turn_count` on the demographics turn.** Still not incremented, so the new safety row
  shares `turn_count: 1` with turn 1's row and is distinguished by `source` and
  `created_at`. Changing turn accounting is P0-04/P0-05 territory and would move the
  diagnosis eligibility floor.
- **P0-14f (transport failure wearing clinical clothing).** `runGuardrail`'s `catch` still
  returns `risk_level: 'medium'` with the patient-facing "The extended safety screen was
  unavailable…" string. Its own P0 ticket; interacts with P0-16 and the UI.
- **BASELINE.md.** Not updated — outside the manifest. See the callout in §3.2.
- **`test:libertymd:db` and `:live`.** Still NOT RUN.

---

## 5. Further safety gaps noticed and NOT fixed

1. **The frontend ignores `emergency` on the demographics turn — the other half of 14d·2,
   and the reason that AC is only half-satisfiable inside this manifest.**
   `LibertyMDChat.submitDemographics` (line 603) does **not** check `data.emergency` or
   `data.state`, unlike `sendAnswer` (line 643) which does. It unconditionally
   `setPhase('intake')` and renders `data.next_question`, falling back to
   `'When did this symptom begin?'`. So a `force_end` returned by the proxy on this turn
   would currently be swallowed and the user would be shown an interview question instead
   of emergency guidance. `LibertyMDApp.submitDemographics` (line 682) has the identical
   omission. **Unreachable today** — no client sends free text, so the proxy cannot
   force_end here — but this must be wired **in the same change** that adds a free-text
   field to the demographics card, or P1-01 opens a live emergency hole. The three-line fix
   mirrors `sendAnswer`; the file is outside my manifest (Lanes C/D/F own it).
2. **14e AC3's rendering half is not done.** The timeout now fails cautious and I verified
   that, but it still renders as a *clinical caution*, not as *technical*. That is P0-14f
   plus P0-16 and it needs `lib/errors.ts` and the UI. Flagged as the single largest
   remaining item in the guardrail's user-visible behaviour.
3. **`test:libertymd:live` asserts `normalStartMs < 3000`**
   (`scripts/libertymd-live-backend-smoke.mjs:85`). Raising turn 1's budget from 2 s to
   10 s does not change *typical* latency — only the worst case — but it does mean a slow
   guardrail now surfaces as a slow start instead of a fast fabricated caution. If that
   smoke assertion starts failing, the finding is "the guardrail is slow", and the fix is
   the guardrail or the rendering, **not** re-tightening the budget. Worth a look when
   `:live` is next run; it is not part of `:ci`.
4. **The interview call is still made and then discarded on `force_end`,** on this turn and
   on `send_message`. Correct for latency, wasteful in tokens, and it means an emergency
   turn still sends symptom text to the interview workflow after an emergency was
   detected. Not a rule-3 violation (n8n writes nothing), and CONTEXT.md's "no inference
   *acted on* after emergency" is honoured, but "no inference *issued* after emergency"
   would be the stronger invariant. Worth a decision, not a bug.
5. **A guardrail `pass` and an unscreened turn are only distinguishable by `source`.**
   Mitigated with `source` + `raw_result.screened` + docstring, but a CHECK-constrained
   fourth status (`not_screened`) would make it structural rather than conventional. Needs
   a migration; out of manifest.
