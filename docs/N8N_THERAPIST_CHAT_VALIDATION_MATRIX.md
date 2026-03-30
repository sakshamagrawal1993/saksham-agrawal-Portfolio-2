# n8n Therapist Chat Validation Matrix

## Purpose

Execution checklist for validating therapist chat CX improvements before broad rollout.

## Feature Flags

- `MC_SYNC_DISCOVERY` (default: `false`)
  - `false`: discovery stays off hot path for chat latency.
  - `true`: allow synchronous discovery on configured cadence.

## KPI Targets

- Median normal-chat response length: decrease >= 30%.
- Repetitive acknowledgement openers: decrease >= 50%.
- Chat latency:
  - p50 improve >= 20%
  - p95 improve >= 15%
- Early exercise recommendation uplift in first-session early turns.
- Zero crisis-branch regressions.

## Scenario Matrix

| ID | Scenario | Input Shape | Expected Result |
|---|---|---|---|
| S1 | Normal early chat | Non-crisis short user concern | Concise response, no filler-heavy opener, no long monologue |
| S2 | Explicit plan request | User asks for step-by-step plan | Longer structured response allowed (`plan_request` mode) |
| S3 | Elevated distress (non-crisis) | Distress cues, no self-harm intent | Supportive but concise response, optional grounding exercise |
| S4 | Crisis-positive | Clear self-harm intent text | Crisis branch short-circuit, crisis payload fields present |
| S5 | Early exercise trigger | Session early turns, no prior exercise | Quick in-chat exercise recommended reliably |
| S6 | Exercise fallback | Eligible for exercise but therapist omits slug | Deterministic fallback exercise injected |
| S7 | Discovery-plan visibility | Discovery proposes pathway/plan | `plan_summary` present and details surfaced in chat |
| S8 | Parser robustness | Malformed nested output shape | Edge parser returns safe fallback response, no crash |
| S9 | Retry behavior | Deterministic syntax/format error | No blind retry loop; fail-safe handling path |
| S10 | Discovery hot-path control | `MC_SYNC_DISCOVERY=false` | No synchronous discovery latency penalty |

## Validation Steps

1. Run controlled test turns in staging with `MC_SYNC_DISCOVERY=false`.
2. Capture timings and payload snapshots for S1-S10.
3. Verify response contracts include required keys:
   - `reply`, `session_state`, `is_session_close`, `crisis_detected`, `quality_meta`
   - optional: `suggested_pathway`, `pathway_confidence`, `plan_summary`
4. Compare pre/post KPIs over equivalent windows.
5. Clinical review sample transcripts for tone and safety.

## Execution Status Snapshot

- Scenario coverage prepared for S1-S10, including async discovery fallback and in-chat plan visibility.
- Feature flag control is active via `MC_SYNC_DISCOVERY`.
- Edge telemetry fields (`context_build_ms`, `n8n_call_ms`, `total_request_ms`) are available for KPI measurement windows.
- Rollout sequencing and rollback triggers are documented below and can be executed without workflow rewrites.

## Rollout Plan

1. **Internal cohort** (small)
   - Enable prompt/model/gating changes.
   - Keep `MC_SYNC_DISCOVERY=false`.
2. **Partial production**
   - Monitor p50/p95, filler rate, exercise uptake.
   - Watch crisis false-negative indicators.
3. **Full rollout**
   - Expand after KPI pass.
   - Optionally test controlled enablement of sync discovery on a small slice.

## Rollback Triggers

- p95 latency worsens materially after release.
- Crisis branch regressions or incorrect routing.
- Significant drop in user-rated helpfulness.
- Parser/formatter error spike.

Rollback actions:

1. Revert workflow definition to previous stable commit.
2. Keep `MC_SYNC_DISCOVERY=false`.
3. Restore previous prompt/model tuning values.
