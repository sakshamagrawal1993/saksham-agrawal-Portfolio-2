# P0-13 · Implementation report

## Outcome
AC5 is met. Four Deno tests attempt all four hard-invariant violations and assert typed refusal; the post-emergency test attempts both Interview and Diagnosis and proves no request is issued.

## Changes
- Added `tests/libertymd/proxy-invariants.mts`.
- Added `test:libertymd:invariants` to `package.json`, `test:libertymd:ci`, and `loop/loop.sh`.
- Routed both demographics consultation updates through `updateOwnedConsultation`, adding JWT ownership assertion and `user_id` filtering.
- Added the P0-13 ticket artifacts and scoped patch.

## Verification
- `npm run test:libertymd:invariants` — PASS, 4 passed / 0 failed.
- `npm run test:libertymd:ci` — PASS, including all existing gates and the new invariant gate.
- `npm run build` — PASS; existing Browserslist, Tailwind ambiguity, chunk, and mixed-import warnings remain.
- IDE lint check on edited TypeScript/MTS files — PASS, no diagnostics.
- `npm run test:health-twin:qa` — unit PASS (61/61), contract completed (21 PASS / 31 NOT_TESTED), browser FAIL because Puppeteer Chrome 149.0.7827.22 is not installed. This unrelated environment failure does not affect the LibertyMD gates.

## Acceptance evidence
- AC1/AC5: turn 16 throws `InvariantViolation(max_turns)`.
- AC2/AC5: post-emergency Interview and Diagnosis throw `PostEmergencyInferenceError`; fetch count remains zero.
- AC3/AC5: `message_type: question` throws `InvariantViolation(message_type_enum)`; insert count remains zero.
- AC4/AC5: mismatched JWT owner throws `InvariantViolation(consultation_ownership)` with HTTP 404; update count remains zero.

## Risks
The tests are deterministic query-builder doubles, not a live Supabase/RLS test. They directly exercise the service-role proxy enforcement points required by AC5.
