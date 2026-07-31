# P0-14a · Deterministic emergency screen: one pattern set, two runtimes

**Lane B · Size M · Priority P0 (upgraded from spec's P1 — see Context §6)**
**Written 2026-07-31. Every number below was re-measured on this date unless marked *inherited*.**

---

## Intent

The deterministic screen is the only emergency path that survives an n8n outage, and n8n
is the component currently failing. Today two copies of it exist, they disagree on 11 of
17 hand-checked inputs, and **neither one detects stroke or suicidal ideation at all** —
so the phase's core question ("is the doctor-ready report the product?") is being asked on
top of a safety net with two named holes in it. This ticket closes the holes and makes the
two copies one.

---

## Context — verified, and what I did not verify

### 1. The spec's central claim is wrong. The edge screen already has five presentations.

`LibertyMD_Ticket_Specs_Phase0_Phase1.md:382` says *"it currently catches exactly one
presentation."* `LANES.md:69` repeats it: *"the edge screen has 1."*

**False.** `supabase/functions/libertymd-care-proxy/clinical-policy.ts:54-80` contains five
rules — `acs_chest_pain`, `thunderclap_headache`, `anaphylaxis`, `respiratory_distress`,
`surgical_abdomen` — and negation handling at `clinical-policy.ts:85-86`. They have been
there since commit `d82fad7` (2026-07-18), *before* the live measurement that produced the
"9/9 identical ACS message" figure.

```
$ git log --follow -- supabase/functions/libertymd-care-proxy/clinical-policy.ts
d82fad7 2026-07-18 Build and validate LibertyMD care platform   rules=5
```

The 9/9 figure describes **what users typed**, not what the screen can catch. This ticket
is therefore neither "porting" (LANES.md:69) nor "extend from one to five" (spec) — it is
**reconciling two five-rule sets and adding the two presentations both are missing.**

### 2. The two copies disagree on 11 of 17 hand-checked inputs.

I extracted both implementations verbatim — `clinical-policy.ts:52-90` and the
`Deterministic Prefilter` node of
`n8n-workflows/definitions/libertymd-guardrail-workflow__9qeE6tUcEY74OYV8.json` — and ran
them side by side:

| Input | edge | n8n |
|---|---|---|
| "I had no chest pain earlier but now I have crushing chest pressure." | — | `acs_chest_pain` |
| "My father had chest pain last year; I have a mild cough." | `acs_chest_pain` | — |
| "It feels like an elephant sitting on my chest." | — | `acs_chest_pain` |
| "My headache came on suddenly and hit me out of nowhere." | — | `thunderclap_headache` |
| "I have a headache with neck stiffness and confusion." | — | `thunderclap_headache` |
| "I don't have chest pain." | `acs_chest_pain` | — |
| "I have severe lower right abdominal pain." | `surgical_abdomen` | — |
| "The pain is so bad I cannot walk." | `surgical_abdomen` | — |
| corpus scenario `lip_dryness_no_swelling` (labelled `non_emergency`) | — | `anaphylaxis` |

Root cause of the first row: the edge screen calls `text.match(pattern)`, which returns
**only the first match**. In *"no chest pain … but crushing chest pressure"* the first
match is negated, so a genuine emergency is suppressed. This is the exact false-negative
fixed on the n8n side on 2026-07-30 and **never carried across to the edge.**

### 3. The 2026-07-30 n8n negation fix introduced a false positive nobody caught.

The n8n clause-boundary split treats a comma as a boundary, so in an enumerated negation
(*"no A, B, or C"*) every item after the first loses its negator. Traced:

```
CASE: "My lips are dry and cracked, but there is no lip swelling, tongue swelling, or breathing trouble."
  match="lip swelling"     seg=" there is no "   negated=true
  match="tongue swelling"  seg=" "               negated=false   → FIRES
```

That input is corpus scenario `lip_dryness_no_swelling`, labelled `non_emergency`.
**A naive port of the n8n logic to the edge would flip the evaluation gate's
`falsePositive` from 0 to 1 and specificity from 1.0 to 0.923.** `BASELINE.md:107` already
warns that the pre-Lane-0 guardrail change is "inherited work to confirm, not settled" —
this is what it was warning about.

### 4. Stroke/FAST and suicidal ideation are absent from both engines and from the corpus.

Verified by running both engines:

| Input | edge | n8n |
|---|---|---|
| "My face is drooping and my arm is weak and my speech is slurred." | — | — |
| "I woke up and one side of my body went numb, I cannot speak properly." | — | — |
| "I want to kill myself." | — | — |
| "I have been thinking about ending my life." | — | — |

`tests/libertymd/clinical-scenarios.v0.1.json` contains **22 scenarios** — 9 emergency,
8 non_emergency, 3 report_gate, 2 off_topic — and **no stroke and no suicidal-ideation
scenario of either polarity**. Stroke is the most time-critical omission in the set.

### 5. The n8n prefilter has zero automated coverage. The edge screen has plenty.

```
$ grep -rl "hasUnnegatedMatch\|Deterministic Prefilter" scripts tests
(no matches)
```

`BASELINE.md:103` credits the 2026-07-30 guardrail change to "15/15 hand cases". Those
cases are not committed anywhere in either repo — I looked. They are unrepeatable.

Meanwhile `scripts/libertymd-clinical-evaluation.ts:54` calls `detectDeterministicEmergency`
directly, so the whole 22-scenario evaluation gate measures **the edge screen only, with
n8n structurally absent.** Two consequences:

- **Spec AC4 ("all emergency scenarios force-end via this screen alone, with n8n stubbed
  offline") is already satisfied** for the 9 existing emergency scenarios. Re-run confirms
  it, live, today:
  ```
  $ npm run test:libertymd:evaluation
  scenarios 22 · truePositive 9 · trueNegative 13 · falsePositive 0 · falseNegative 0
  sensitivity 1 · specificity 1 · engineeringRegressionPassed true
  ```
  This matches `BASELINE.md:47-54` exactly. **The existing gate already covers spec AC4 —
  this ticket only has to extend the corpus, not build the mechanism.**
- The n8n prefilter is the untested half. Any parity work has to bring it under test, not
  just align it.

### 6. Why this is P0, not the spec's P1

`lib/safety.ts:85-100` runs the edge screen **first** and returns immediately on a hit —
n8n is never consulted. So the two failure directions are not symmetric:

- an edge **false negative** is recoverable, but only while n8n is up — and n8n being down
  is the entire reason this screen exists;
- an edge **false positive** has no backstop at all.

A missing stroke pattern is therefore an unbacked gap in the one n8n-independent path.
That is PRD failure mode #1 (`docs/product/PRD.md:93`), which is P0 by definition.

### 7. Constraints I verified rather than assumed

- **No migration needed.** `libertymd_safety_events.crisis_type` and `.care_setting` are
  free text with defaults — `supabase/migrations/20260718080000_libertymd_care_schema.sql:77-78`.
  Only `status` and `risk_level` carry CHECKs (`:75-76`), and both new presentations use
  existing values.
- **`care_setting` is constrained by the contract gate, not the DB.**
  `schemas/libertymd/n8n/guardrail-response.schema.json:30` enumerates
  `home|telehealth|urgent_care|emergency_department|call_911`, and `:47` requires
  `emergency_department|call_911` whenever `status === 'force_end'`. A new `crisis_line`
  value would need a schema change.
- **The corpus schema is closed.** `schemas/libertymd/clinical-scenario-suite.schema.json`
  sets `additionalProperties: false` on `expected` (which allows only `emergency_action`,
  `input_relevance`, `report_outcome`). Asserting `crisis_type` per scenario requires
  editing that schema.
- **P0-14c has not landed.** `lib/safety.ts:98` still writes `raw: {}` on the edge branch.
  Lane B schedules 14c before 14a; it has not run. See Dependencies.
- **The n8n regex `wheezing after (peanut|shellfish|bee|sting)` misses "wheezing after
  a bee sting"** — the article breaks the match. Verified.
- **The target end-state is reachable without regressing the gate.** I prototyped the
  unified matcher (clause split on adversatives and sentence terminators only — *not* on
  commas) and ran it: 15/16 hand positives fire, 0/15 hand negatives fire, and the existing
  22-scenario corpus stays at `falseNegative 0 · falsePositive 0`. The one miss is the
  "a bee sting" article bug above. The ACs below are written against a shape I have
  actually executed.

### Inherited, not verified by me

- The live-funnel and "9/9 true positives, 0 false positives" figures (`DECISIONS.md:36`) —
  I have no database access in this session and did not re-query `libertymd_safety_events`.
- `BASELINE.md:98` says the 2026-07-30 workflow backups are in
  `n8n-workflows/definitions/.backup-20260730/`. That directory does not exist; `find`
  locates them at `n8n-workflows/scratch/.backup-20260730`. Corrected here, not fixed —
  BASELINE is outside this ticket's manifest.
- `BASELINE.md:26` says "all five gates"; `package.json:38` chains **six**
  (`contracts · separability · policy · recovery · simulations · evaluation`). Same note.
- Spec AC4 refers to a "15-scenario corpus"; it is 22.

---

## Scope

### In

1. **One reviewable, versioned pattern set** as the single source of truth, consumed by
   both runtimes. The n8n `Deterministic Prefilter` body is **generated** from it, and a
   gate fails if the checked-in body drifts from the generated one. This is what makes
   AC6 ("adding a presentation requires no change outside that file") true across two
   runtimes that cannot share an import.
2. **Reconciling all drift** listed in Context §2, in the direction of the more sensitive
   engine, *except* the enumerated-negation false positive in Context §3, which is fixed
   in both.
3. **Adding `stroke_fast`** as a sixth presentation, on both sides.
4. **Adding `suicidal_ideation`** as a seventh, emitting a distinct `crisis_type` and
   crisis-line message copy — not medical-emergency copy.
5. **Porting the 2026-07-30 negation discipline to the edge**: all matches checked (not
   just the first), clause-bounded lookback, past-tense family-history suppression.
6. **Structured match output** — `patternId`, matched span, and pattern-set version on the
   returned object, so P0-14c has something to persist.
7. **Test corpora**: a dedicated positive/negative suite for the pattern set, plus targeted
   additions to `clinical-scenarios.v0.1.json`.
8. **A parity gate** wired into `npm run test:libertymd:ci`.

### Out

- **Narrowing any existing pattern to require a symptom+qualifier co-occurrence.** The
  spec's Approach section asks for this (`chest pain` **and** one of crushing/radiating/
  sweating). Both engines currently fire on bare "I have chest pain" — I verified it.
  Narrowing it reduces detection sensitivity, which `DECISIONS.md:36-37` forbids ("keep and
  expand"; "never reduce detection sensitivity to reduce interruptions"). **DECISIONS
  overrides the spec** (`docs/product/PRD.md:14`). Not escalated — already answered.
- **Visual/severity treatment of the new crisis types.** P0-16 (severity tiers, landed) and
  P0-17 (condition-specific copy) own that. This ticket emits the discriminator; it does
  not style it. Verified no client file reads `crisis_type` today.
- **Running the screen on turns it does not currently run on** — P0-14b.
- **Persisting the match into `raw_result`** — P0-14c's AC1/AC2. This ticket produces the
  data; see Dependencies for the ordering problem.
- **Broad clinical coverage.** Deliberately narrow and stereotyped; breadth is the LLM's job.
- **Clinician sign-off.** No decision commits a clinician. The pattern file carries a
  `pending` review annotation and `clinical_status` stays `draft`; `clinicalReleaseGatePassed:
  false` remains the expected standing state (`BASELINE.md:59`).
- **HIPAA/BAA anything** (`DECISIONS.md:55`).

---

## File manifest

```
supabase/functions/libertymd-care-proxy/emergency-patterns.ts
supabase/functions/libertymd-care-proxy/clinical-policy.ts
supabase/functions/libertymd-care-proxy/lib/safety.ts
../n8n-workflows/definitions/libertymd-guardrail-workflow__9qeE6tUcEY74OYV8.json
scripts/libertymd-emergency-pattern-sync.ts
scripts/libertymd-clinical-evaluation.ts
tests/libertymd/emergency-patterns.test.ts
tests/libertymd/clinical-policy.test.ts
tests/libertymd/clinical-scenarios.v0.1.json
schemas/libertymd/clinical-scenario-suite.schema.json
schemas/libertymd/n8n/guardrail-response.schema.json
package.json
docs/libertymd/CARE-ARCHITECTURE.md
tickets/P0-14a/01-story.md
tickets/P0-14a/02-tech-plan.md
tickets/P0-14a/03-clarified.md
tickets/P0-14a/04-implementation-report.md
tickets/P0-14a/05-qa-report.md
tickets/P0-14a/06-review.md
tickets/P0-14a/logs/
```

**Manifest notes for the scheduler:**

- `../n8n-workflows/definitions/libertymd-guardrail-workflow__9qeE6tUcEY74OYV8.json` is
  **atomic** per `LANES.md:62` — whole file, one owner, Lane B. It lives in a **separate
  git repository** (`/Users/sakshamagrawal/Documents/Projects/n8n-workflows`, confirmed a
  work tree). The no-push rule applies there too.
- `schemas/libertymd/n8n/guardrail-response.schema.json` is listed **conditionally** —
  touched only if OQ-1 resolves toward a `crisis_line` care setting. Default path does not
  touch it.
- `package.json` is a known cross-lane collision point (Lane E adds scripts too). One added
  line plus one edit to `test:libertymd:ci`. Merge by hand if it conflicts.
- **Explicitly NOT touched**, so other lanes may hold them: `lib/types.ts`, `lib/errors.ts`,
  `lib/config.ts`, `lib/n8n-client.ts`, any `components/LibertyMD/*`, any file under
  `supabase/migrations/`, the interview and diagnosis workflow JSONs.
- `tickets/BASELINE.md` and `tickets/DECISIONS.md` are **deliberately excluded** per
  `LANES.md:132` — append-only, reconciled by hand at merge. This ticket **will** move the
  numbers in `BASELINE.md:47-54`; the QA report must state the new confusion matrix so the
  controller can reconcile it.

---

## Acceptance criteria

Every criterion below is checkable by a command I have run, or by a test this ticket adds.

1. **Single source of truth exists and is versioned.**
   `supabase/functions/libertymd-care-proxy/emergency-patterns.ts` exports
   `EMERGENCY_PATTERN_SET_VERSION` (semver string) and `EMERGENCY_PATTERNS` (array). Each
   entry has `id`, `crisisType`, `careSetting`, `message`, the matcher source, and a
   `clinicianReview` annotation with `status: 'pending'`.
   *Check:* `deno eval 'import {EMERGENCY_PATTERNS,EMERGENCY_PATTERN_SET_VERSION} from
   "./supabase/functions/libertymd-care-proxy/emergency-patterns.ts"; ...'` prints 7 entries,
   every entry has all six fields, and the version parses as `^\d+\.\d+\.\d+$`.

2. **`clinical-policy.ts` contains no inline emergency regex.**
   *Check:* `grep -c "crisisType: '" supabase/functions/libertymd-care-proxy/clinical-policy.ts`
   returns `0`, and `detectDeterministicEmergency` is still exported with the same call
   signature `(message: string) => …| null`.

3. **Seven presentations, seven distinct `crisis_type` values.**
   The set is `acs_chest_pain`, `thunderclap_headache`, `anaphylaxis`,
   `respiratory_distress`, `surgical_abdomen`, `stroke_fast`, `suicidal_ideation`.
   *Check:* a test asserts `new Set(EMERGENCY_PATTERNS.map(p => p.crisisType)).size === 7`
   and equals that exact set.

4. **Suicidal ideation does not wear medical-emergency clothing.**
   The `suicidal_ideation` entry's `message` contains a crisis-line instruction and does
   **not** contain `911`, `ER`, or `emergency room`; every other entry's message does
   contain emergency-service guidance. `crisis_type` is `suicidal_ideation`, distinct from
   all six medical types.
   *Check:* assertion in `tests/libertymd/emergency-patterns.test.ts`.

5. **Both new presentations detect, given the inputs in Context §4.**
   `detectDeterministicEmergency` returns `stroke_fast` for *"My face is drooping and my arm
   is weak and my speech is slurred."* and *"I woke up and one side of my body went numb, I
   cannot speak properly."*; returns `suicidal_ideation` for *"I want to kill myself."* and
   *"I have been thinking about ending my life."* All four return `null` today.

6. **Negative corpus: ≥ 15 negative cases, and negatives ≥ 3× positives.**
   In `tests/libertymd/emergency-patterns.test.ts`. Negatives must include, at minimum:
   `"I have a low fever and fatigue, with no chest pain and no trouble breathing."` ·
   `"My lips are dry and cracked, but there is no lip swelling, tongue swelling, or breathing trouble."` ·
   `"My father had chest pain last year; I have a mild cough."` ·
   `"I don't have chest pain."` ·
   `"There is a family history of chest pain but I feel fine."` ·
   `"My leg fell asleep and is numb."` (stroke negative) ·
   `"I have been feeling low but I have no thoughts of harming myself."` (SI negative) ·
   `"This headache is killing me."` (SI idiom negative) ·
   `"My eyes are itchy and I am sneezing, but there is no throat tightness or swelling."`
   *Check:* the test asserts `NEGATIVES.length >= 15 && NEGATIVES.length >= 3 * POSITIVES.length`
   and that every negative returns `null`.

7. **The enumerated-negation false positive is fixed in both engines.**
   Both `detectDeterministicEmergency` and the generated n8n prefilter return no hit for
   `"My lips are dry and cracked, but there is no lip swelling, tongue swelling, or breathing trouble."`
   *Check:* asserted for the edge in the pattern test; asserted for n8n by AC10's parity gate.

8. **The first-match-only false negative is fixed in the edge engine.**
   `detectDeterministicEmergency("I had no chest pain earlier but now I have crushing chest pressure.")`
   returns `acs_chest_pain`. Returns `null` today.

9. **Every drift row in Context §2 resolves to agreement.**
   *Check:* the parity gate (AC10) runs all 17 inputs from Context §2 plus the full positive
   and negative corpora through both engines and asserts identical `crisisType` (or identical
   `null`) for every input. Zero disagreements.

10. **A parity gate exists, runs in CI, and fails on drift.**
    `scripts/libertymd-emergency-pattern-sync.ts --check` renders the prefilter body from
    `emergency-patterns.ts`, compares it to `nodes[name="Deterministic Prefilter"]
    .parameters.jsCode` in the guardrail workflow JSON, and exits non-zero on any difference.
    It resolves the definitions directory with the same order as the contracts gate
    (`--definitions-dir=` → `LIBERTYMD_N8N_DEFINITIONS_DIR` → `../n8n-workflows/definitions`)
    and **hard-fails when the directory is missing** — never a silent skip
    (`BASELINE.md:111`).
    *Check:* `npm run test:libertymd:pattern-parity` exits 0 on the committed tree; mutate
    one character of the workflow's `jsCode` and it exits 1. The script is added to
    `test:libertymd:ci` in `package.json:38`.

11. **AC6 of the spec is demonstrably true.**
    *Check:* add a throwaway eighth pattern to `emergency-patterns.ts` only, run the sync
    script in write mode, and the guardrail workflow JSON updates with no other source file
    edited. Revert. The implementation report records the diff stat of that experiment.

12. **Structured match output for P0-14c.**
    `detectDeterministicEmergency` returns `{ crisisType, message, patternId, matchedSpan,
    patternSetVersion, careSetting }`. `matchedSpan` is the matched substring only — not the
    whole message.
    *Check:* asserted in the pattern test; and `matchedSpan.length <= 64` for every positive
    case, so the persisted span cannot become a transcript.

13. **Corpus extended, with the crisis type asserted.**
    `clinical-scenarios.v0.1.json` gains at least: 2 stroke emergencies, 1 suicidal-ideation
    emergency, the clause-boundary positive from AC8, and 4 matching non-emergency negatives
    (stroke negative, SI negative, family-history negative, enumerated-negation negative).
    `expected.crisis_type` is added to the schema and populated for every `emergency`
    scenario, and `scripts/libertymd-clinical-evaluation.ts` asserts it.
    *Check:* `npm run test:libertymd:contracts` passes with `clinicalScenarioSuite.valid: true`
    and `scenarios >= 30`.

14. **No safety regression on the evaluation gate.**
    *Check:* `npm run test:libertymd:evaluation` reports `falseNegative: 0`,
    `falsePositive: 0`, `sensitivity: 1`, `specificity: 1`,
    `engineeringRegressionPassed: true`, `failures: []`. `clinicalReleaseGatePassed: false`
    and `clinicalTargetsApproved: false` remain unchanged — expected, not a defect
    (`BASELINE.md:59`).

15. **The screen is bounded on adversarial input.**
    `detectDeterministicEmergency` on a 10,000-character input built from repeated
    `"chest chest chest "` returns within 50 ms.
    *Check:* timed assertion in the pattern test. The screen runs on every user message and
    the matcher loops globally over every match; unbounded backtracking here is a
    denial-of-service on the safety path.

16. **No PHI escapes.** No new `console.log`/`console.error` call receives the user message
    or the matched span, and `matchedSpan` appears in no telemetry payload.
    *Check:* `grep -rn "matchedSpan\|matched_span" supabase/functions/libertymd-care-proxy/`
    returns hits only in `emergency-patterns.ts`, `clinical-policy.ts`, and `lib/safety.ts`'s
    `raw` assignment — never in `lib/telemetry.ts` (`CONTEXT.md:46`).

---

## Definition of Done additions

Beyond the standing gates:

- [ ] `npm run test:libertymd:ci` green, **including the new parity gate**, with the raw
      output pasted into `05-qa-report.md`.
- [ ] `npx tsc --noEmit -p tsconfig.json` total is **≤ 103**, and per-file counts for every
      file this ticket touches are unchanged or lower (`BASELINE.md:65-82`). Note
      `tests/libertymd/clinical-policy.test.ts` currently carries 16 — do not add to it.
- [ ] `npm run build` green.
- [ ] The new confusion matrix (TP/TN/FP/FN, sensitivity, specificity, `scenarios`) is
      stated verbatim in `05-qa-report.md` so the controller can reconcile `BASELINE.md`.
      **Do not edit `BASELINE.md` from inside this ticket.**
- [ ] `docs/libertymd/CARE-ARCHITECTURE.md` records that the pattern set has one source of
      truth, that the n8n prefilter is generated, and how to regenerate it.
- [ ] The pattern file's `clinicianReview` annotations are all `status: 'pending'` and the
      suite's `clinical_status` is still `draft`. **No clinician sign-off is claimed.**
- [ ] The AC11 codegen experiment is performed and its diff stat recorded.
- [ ] Nothing committed, pushed, or PR'd in **either** repository — including
      `n8n-workflows`, which is a separate work tree.
- [ ] The n8n workflow is **not** deployed or activated by this ticket. The file change is
      a definition change only; the controller owns activation.

---

## Dependencies

| Dependency | State (verified 2026-07-31) |
|---|---|
| **L0-5** proxy decomposition | ✅ Landed. `lib/` (11 modules) and `actions/` (8) exist. |
| **P0-14d** demographics-turn guardrail | ✅ Landed. `unscreenedTurnResult` at `lib/safety.ts:45`; 2 demographics corpus scenarios present. |
| **P0-14f / P0-16** severity taxonomy | ✅ Landed. `severityForSafetySignal` at `lib/types.ts:176`. Unchanged by this ticket — `force_end` → `emergency` regardless of crisis type. |
| **P0-14c** `raw_result` logging | ❌ **NOT landed.** `lib/safety.ts:98` still writes `raw: {}`. |
| **P0-14b** every-turn evaluation | Downstream — depends on this ticket, per spec. |
| **P0-17** condition-specific copy | Downstream — consumes the 7 `crisis_type` values this ticket defines. Sequence 14a before 17 (`LANES.md:143`). |

### The 14c ordering problem — needs a controller decision, not a blocker

`LANES.md:67` schedules P0-14c *before* P0-14a. But 14c's AC1 requires persisting "the
matched pattern id, the matched span, and the pattern-set version" — **none of which exist
until this ticket creates them.** The order as written is circular.

**Recommendation, which I have scoped for:** P0-14a produces the three fields on the
returned object (AC12) and populates them into the `raw` object at `lib/safety.ts:98`,
because the alternative is 14c shipping a stub and 14a rewriting it two days later. That
satisfies 14c's AC1 and AC2 as a side effect and leaves 14c holding only its AC3 (the
false-positive-review query). **The controller should decide whether to shrink 14c to AC3
or drop it** — flagged as a finding, not resolved unilaterally.

### Blocking environment problem — must be fixed before implementation starts

The worktree `.worktrees/P0-14a` is at commit `4e6e23a` and **does not contain any of the
work above.** L0-5's decomposition and every P0-14x change are **uncommitted and untracked
in the main repo**, so the worktree has none of them:

```
$ ls .worktrees/P0-14a/supabase/functions/libertymd-care-proxy/
clinical-policy.ts  index.ts  session-recovery.ts        ← no lib/, no actions/
$ ls  ~/…/saksham-agrawal-Portfolio-2/supabase/functions/libertymd-care-proxy/
actions/  lib/  clinical-policy.ts  index.ts  session-recovery.ts
$ git status --short   # main repo
?? supabase/functions/libertymd-care-proxy/actions/
?? supabase/functions/libertymd-care-proxy/lib/
```

An implementer working in the worktree would edit a proxy that no longer exists and produce
a diff that cannot merge. **Resolve before starting**: either work directly in the main
repo, or have the controller land Lane 0 → P0-14f as a commit the worktree can rebase onto.

---

## Risks

1. **An edge false positive has no backstop.** `lib/safety.ts:85-100` short-circuits before
   n8n, so nothing downstream can overturn an edge hit. Every widening in this ticket lands
   on the unbacked side. *Control:* AC6's negative corpus, sized 3× the positives, and AC9's
   two-engine parity check.

2. **Naively porting the n8n negation imports a verified false positive** (Context §3),
   flipping specificity to 0.923 and breaking `BASELINE.md:47-54`. *Control:* AC7, written
   before the port. The prototype in Context §7 shows the fix — split clauses on adversatives
   and sentence terminators, **not** on commas — holds all 22 existing scenarios.

3. **Suicidal-ideation detection on free text has expensive idiomatic false positives.**
   "this headache is killing me", "I could kill him", "I'm dying of embarrassment". Routing
   someone to a crisis line unprompted is not a cheap false positive — it is an accusation.
   This is the one presentation where the usual safety asymmetry does **not** obviously hold,
   because the failure is social rather than clinical. *Control:* AC6 mandates the idiom
   negatives; keep the SI matcher literal and first-person (explicit self-harm intent), and
   annotate it as the highest-uncertainty entry for review.

4. **Widening the thunderclap pattern raises migraine false positives.** n8n's
   `sudden(ly)? (severe|worst|excruciating|blinding|intense) headache` catches
   "sudden intense headache", which a chronic migraine sufferer types routinely. *Control:*
   corpus already holds `gradual_mild_headache`; add a "sudden intense migraine, same as
   always" negative. Under `DECISIONS.md:37` a headache false positive stays preferable to a
   missed subarachnoid haemorrhage — do not narrow it, just measure it.

5. **Codegen writes into a live production workflow definition.** A malformed render
   silently breaks the guardrail's prefilter for every user. *Control:* AC10's `--check` is
   what runs in CI; write mode is manual and never invoked by a gate. The file is atomic and
   Lane B-owned (`LANES.md:62`), so no other lane can interleave a write. Do not deploy or
   activate.

6. **`crisis_type` has no database constraint** (`…care_schema.sql:77`), so a typo produces a
   crisis type nobody maps and the user gets generic copy on a real emergency. *Control:*
   AC3's exact-set assertion is the only thing standing between a typo and silent
   mis-routing. P0-17 must key off the same constant, not a string literal.

7. **ReDoS on the safety path.** The matcher now loops globally over every match, and
   patterns contain `.{0,30}` / `.{0,40}`. An adversarial message could stall the edge
   function on the turn most likely to contain an emergency. *Control:* AC15.

8. **Two repos, one change.** The pattern set and its generated consumer live in different
   git repositories. A partial merge leaves the two engines disagreeing again — the exact
   state this ticket exists to end. *Control:* AC10 runs in `:ci`, so a partial merge fails
   the gate rather than passing quietly.

---

## Open questions

**OQ-1 · Does suicidal ideation need its own `care_setting`?**
`schemas/libertymd/n8n/guardrail-response.schema.json:47` permits only
`emergency_department|call_911` when `status === 'force_end'`. My scoped default is
`care_setting: 'call_911'` with `crisis_type: 'suicidal_ideation'` carrying the distinction
— imminent self-harm intent is a genuine emergency-services escalation, and this needs no
schema change. If the business owner wants a distinct `crisis_line` care setting for
routing or reporting, the schema enum must gain it in both places. **Not blocking**; the
default ships unless told otherwise.

**OQ-2 · Is trailing negation worth handling?**
Spec AC3 names *"I am worried about chest pain but don't have any"* as a must-not-fire.
I verified **both engines fire on it today** — the negator follows the match, and both use
lookback only. My recommendation is to **accept this false positive and document it**,
because the naive fix (scan forward for a negator) would suppress *"I have crushing chest
pain but no shortness of breath"* — converting a cheap false positive into a false-negative
class on ACS. Under `DECISIONS.md:36-37` that trade is forbidden. **Requires a business-owner
answer only if they want spec AC3 honoured literally**; otherwise the case is added to the
test file as a documented known-FP with the rationale inline.

**OQ-3 · Should the n8n prefilter's `source` string be aligned?**
n8n emits `source: 'deterministic'`, the edge emits `source: 'edge_deterministic'`
(`lib/safety.ts:96`). Distinguishing which engine fired is useful for audit, so I have kept
them different and left it out of scope — but if P0-14c's review query is meant to treat
them as one population, that should be an explicit decision rather than an accident.
