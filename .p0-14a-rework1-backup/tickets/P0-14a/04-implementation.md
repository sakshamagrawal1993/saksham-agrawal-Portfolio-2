# P0-14a — Implementation report

**Date:** 2026-07-31  
**Role:** Tech Lead implementer  
**Status:** Engineering gates pass; clinical review remains pending.

## Outcome

- Added `emergency-patterns.ts` as the versioned source of truth for seven deterministic presentations.
- Added `stroke_fast` and terminal `suicidal_ideation`; suicidal ideation routes to `crisis_line` with 988 copy and no 911/ER/ambulance phrasing.
- The edge matcher imports the shared set and returns `crisisType`, `careSetting`, `message`, `patternId`, `matchedSpan`, and `patternSetVersion`.
- The n8n Deterministic Prefilter is generated from the shared set. A 40-case parity gate compares edge and n8n outcomes and is included in `test:libertymd:ci`.
- Preserved all-match negation, adversative clause boundaries, comma-preserving enumerated negation, and past-tense family-history suppression.
- Added `crisis_line` to the guardrail response schema and its `force_end` allowed set.
- Expanded the clinical suite from 22 to 30 scenarios and asserted `crisis_type` for every emergency scenario.
- No LibertyMD client component was changed.

## Files changed

### Portfolio repository

- `supabase/functions/libertymd-care-proxy/emergency-patterns.ts` — canonical versioned pattern set.
- `supabase/functions/libertymd-care-proxy/clinical-policy.ts` — shared-pattern consumer and structured match output.
- `supabase/functions/libertymd-care-proxy/lib/safety.ts` — propagates pattern-specific care setting.
- `scripts/libertymd-emergency-pattern-sync.mjs` — generator and semantic parity gate.
- `scripts/libertymd-clinical-evaluation.ts` — emergency `crisis_type` assertion.
- `tests/libertymd/emergency-pattern-cases.json` — 10 positive and 30 negative parity cases.
- `tests/libertymd/emergency-patterns.test.ts` — pattern, copy, negation, structured-output, and bounded-runtime tests.
- `tests/libertymd/clinical-policy.test.ts` — registers the focused suite.
- `tests/libertymd/clinical-scenarios.v0.1.json` — 30-scenario clinical corpus.
- `tests/libertymd/contracts/guardrail-crisis-line.valid.json` — crisis-line force-end contract fixture.
- `schemas/libertymd/clinical-scenario-suite.schema.json` — crisis-type vocabulary.
- `schemas/libertymd/n8n/guardrail-response.schema.json` — `crisis_line` vocabulary and force-end allowance.
- `package.json` — pattern sync/parity scripts and CI registration.
- `docs/libertymd/CARE-ARCHITECTURE.md` — source-of-truth and regeneration contract.
- `.p0-14a-backup/` — requested pre-edit backups.

### n8n repository

- `definitions/libertymd-guardrail-workflow__9qeE6tUcEY74OYV8.json` — generated deterministic prefilter plus stroke/SI/crisis-line LLM vocabulary.
- `.p0-14a-backup/definitions/libertymd-guardrail-workflow__9qeE6tUcEY74OYV8.json` — requested pre-edit backup.

## Gate results

- `npm run test:libertymd:ci` — PASS, including contracts, separability, parity, policy, recovery, breaker, invariants, simulations, and evaluation.
- `npm run test:libertymd:policy` — PASS, 35/35.
- `npm run test:libertymd:breaker` — PASS, 17/17.
- `npm run test:libertymd:evaluation` — PASS:
  - scenarios 30
  - truePositive 13
  - trueNegative 17
  - falsePositive 0
  - falseNegative 0
  - sensitivity 1
  - specificity 1
  - `engineeringRegressionPassed: true`
  - `clinicalReleaseGatePassed: false` (expected while review is pending)
- `npm run test:libertymd:contracts` — PASS; 9 fixtures, 3 workflows, 30-scenario suite valid.
- `npm run test:libertymd:pattern-parity` — PASS; 7 presentations, 40 cases, 0 disagreements.
- `npm run build` — PASS.
- `npx tsc --noEmit -p tsconfig.json` measurement — total 102; `LibertyMDChat.tsx` 7; `LibertyMDApp.tsx` 21; new emergency test 0. Baseline ceilings were not raised.
- IDE lint diagnostics on edited TypeScript files — no errors.

## Code-generation proof

A temporary eighth pattern was added only to `emergency-patterns.ts`, then the sync command was run:

- source diff: 1 file, 8 insertions
- generated n8n diff: 1 file, 1 insertion / 1 deletion
- no generator or matcher source change was needed
- the probe was removed, the workflow regenerated, and byte-for-byte comparison against the pre-experiment snapshots passed

## Acceptance criteria not fully met

- Clinical approval is intentionally not claimed. `clinical_status` remains `draft`, all pattern/scenario annotations remain `pending`, and `clinicalReleaseGatePassed` remains `false`.
- The n8n definition was not deployed or activated, and no live clinical integration was exercised. Publication belongs to the controller.
- No other engineering acceptance criterion is known to be unmet.

## REQUIRES EXPERT REVIEW

1. **Entire deterministic pattern set:** `emergency-patterns.ts` entries for ACS, thunderclap headache, anaphylaxis, respiratory distress, surgical abdomen, FAST stroke, and suicidal ideation.
2. **Suicidal-ideation matcher and copy:** the literal first-person intent matcher, `careSetting: 'crisis_line'`, and “call or text 988” message. Confirm sensitivity, idiom/negation exclusions, and patient-facing wording.
3. **Stroke matcher and copy:** confirm FAST phrase coverage and acceptable false-positive posture.
4. **Clinical corpus additions:** all eight P0-14a scenarios remain draft engineering fixtures pending expert review.

No PHI logging, client clinical-table write, n8n database write, or client chrome change was introduced.
