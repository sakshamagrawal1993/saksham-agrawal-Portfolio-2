# P0-14a — Clarified story

**Ticket:** P0-14a · Extend deterministic emergency screen to five canonical presentations (+ stroke + suicidal ideation routing)
**Date clarified:** 2026-07-31
**Authority:** `01-story.md` + `tickets/DECISIONS.md` (2026-07-31 P0-14a entries)

## Business-owner answers absorbed

1. **`suicidal_ideation` is terminal** — `force_end`, same as medical emergency. Only `care_setting` and copy differ (crisis line / 988; never ER/911 framing).
2. **`care_setting: 'crisis_line'` belongs in the schema** (and in the `force_end` allowed set). Crisis routing is not `crisis_type`-only.

## Intent

Close edge↔n8n deterministic-screen drift. One pattern module is the source of truth for both screens; edge gains stroke + suicidal ideation; suicidal ideation force-ends with crisis-line copy, not medical ER copy.

## Scope

**In**
- Shared pattern module (versioned) consumed by edge `detectDeterministicEmergency` and used to keep n8n Deterministic Prefilter in parity (or generate/assert parity).
- Presentations: ACS, anaphylaxis, thunderclap, stroke/FAST, severe dyspnea, surgical abdomen (existing), + suicidal ideation → `crisis_line`.
- Negation + past-tense family-history discipline (already partially landed in defect pack — preserve FN 0 / FP 0).
- Schema + LLM prompt vocabulary: `stroke_fast`, `suicidal_ideation`, `crisis_line`.
- Corpus + parity gate; `falseNegative` stays 0; `engineeringRegressionPassed: true`.

**Out**
- Final polished condition-specific copy UI (P0-17) beyond a minimal distinguishable crisis-line message.
- Frontend severity chrome (already done in defect pack / P0-16).
- Running the screen every turn (P0-14b) — depends on this landing first.

## File manifest

- `supabase/functions/libertymd-care-proxy/clinical-policy.ts`
- `supabase/functions/libertymd-care-proxy/lib/safety.ts` (if GuardrailResult construction needs care_setting)
- `supabase/functions/libertymd-care-proxy/emergency-patterns.ts` (new, if extracted)
- `../n8n-workflows/definitions/libertymd-guardrail-workflow__9qeE6tUcEY74OYV8.json` (atomic)
- `schemas/libertymd/n8n/guardrail-response.schema.json` (if present in repo)
- `tests/libertymd/clinical-scenarios.v0.1.json`
- `tests/libertymd/clinical-policy.test.ts` / new parity / pattern tests
- `scripts/libertymd-clinical-evaluation.ts` (crisis_type assertion if required by story AC21)
- `scripts/libertymd-emergency-parity-check.mjs` (new, if building AC1)
- `tests/libertymd/emergency-pattern-cases.json` (new)

## Acceptance criteria

Honour numbered ACs in `01-story.md` with these overrides:
- Suicidal ideation **force_ends** with `care_setting: 'crisis_line'` and 988-bearing message; no ER/911/ambulance phrasing.
- Schema includes `crisis_line`.
- Defect-pack negation/family-history behaviour must not regress (`lip_dryness_no_swelling` continues; father-had-chest-pain does not fire; `no X but Y` still fires on Y).

## DoD+

- All standing LibertyMD gates green including `test:libertymd:breaker`.
- TS: no new errors vs BASELINE (Chat ≤7, App ≤21, total ≤102 after defect pack — do not raise).
- `REQUIRES EXPERT REVIEW` on pattern set + suicidal ideation copy.

## Dependencies

- Defect pack committed (`83b1188`).
- Blocks P0-14b, informs P0-17.

## Risks

- Widening patterns without negation discipline → false positives. Negatives ≥ 3× positives.
- Suicidal ideation copy is clinical — expert review required before public launch.
