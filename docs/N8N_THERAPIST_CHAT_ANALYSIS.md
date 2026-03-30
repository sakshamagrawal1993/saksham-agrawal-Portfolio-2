# n8n Therapist Chat Workflow Analysis

## Context

This document captures the latest analysis of the Mind Coach therapist chat workflow and converts findings into an implementation-ready task backlog.

Primary concerns raised from testing:

1. Responses are too long and hard to scan.
2. Therapist uses too much acknowledgement filler.
3. Response latency is too high.
4. Quick in-chat exercises are not triggered early enough in general chat.

Additional requirement:

- Long, structured responses should still be available when the user explicitly asks for a plan.
- If a plan is generated/presented via the discovery pathway, key plan details must also be summarized in the chat reply for the user.

---

## Current Workflow Shape

Current runtime path (high level):

1. Edge function (`mind-coach-chat`) prepares context and calls n8n webhook.
2. n8n workflow runs crisis screening first.
3. Non-crisis branch runs therapist generation.
4. Discovery branch may run on selected turns.
5. Final response formatter returns normalized payload.

Main files:

- App edge: `supabase/functions/mind-coach-chat/index.ts`
- Shared context: `supabase/functions/_shared/mindCoachContext.ts`
- n8n definition (primary): `n8n-workflows/definitions/mind-coach-therapist-chat-and-discovery-v6-robust__EBo9At6eCh0S7vkM.json`

---

## Root-Cause Analysis

### 1) Long responses

- Therapist generation is allowed a high output budget.
- Prompt style allows expansive response composition in normal chat.
- No explicit split between concise chat mode and plan mode.

### 2) Acknowledgement filler

- Prompt cadence over-indexes on validation.
- Repetitive opener controls are not strict enough.
- Warmth and validation are being expressed redundantly.

### 3) Slow responses

- Multiple model calls are executed in series (crisis + therapist, plus discovery when triggered).
- Discovery is currently on the synchronous path for qualifying turns.
- Context payload can be heavy for early turns.

### 4) Low early quick exercise recommendations

- Trigger window is narrow and brittle.
- Eligibility depends on strict acknowledgement/keyword patterns.
- Exercise-history detection may suppress early recommendations too aggressively.

---

## Recommended Design Direction

Use a phased, low-risk architecture change:

1. Keep crisis screening synchronous and safety-first.
2. Keep therapist reply synchronous.
3. Move discovery to asynchronous/background processing.
4. Add explicit response modes:
   - `normal_chat` -> concise by default.
   - `plan_request` -> longer structured responses.

This delivers faster perceived response time and better quality control without a risky one-shot rewrite.

---

## Issue-by-Issue Solutions

### A) Long responses

- Add response mode routing in Prompt Builder.
- Enforce concise normal-chat output budget.
- Reduce normal-mode token/temperature defaults.
- Keep expanded budget only for explicit plan intent.

Suggested defaults:

- Normal chat: `maxTokens` 500-700, temperature 0.25-0.35.
- Plan mode: larger token budget allowed.

### B) Acknowledgement filler

- Make validation conditional, not mandatory every turn.
- Block repeated stock acknowledgement openers.
- Require each response to progress the conversation (reflection + next-step question/action).

### C) Latency

- Remove discovery from synchronous response path.
- Trigger discovery async after chat response returns.
- Add stage-level latency instrumentation in edge.
- Keep crisis path strict and fail-safe.

### D) Early quick exercise recommendation

- Replace narrow trigger window with stage-aware eligibility.
- Relax brittle dependency on acknowledgement phrase checks.
- Add deterministic fallback exercise suggestion if eligible and none offered.
- Improve session-aware exercise history handling.

### E) Discovery-plan visibility in chat

- When discovery generates a pathway/plan recommendation, include a concise "what this means now" summary in the same assistant chat response.
- Ensure summary includes:
  - proposed pathway name,
  - why it is being recommended (1 line),
  - immediate next step (for example, review/follow pathway).
- Keep this summary compact unless the user asks for more detail.
- Preserve normalized payload contract while adding explicit fields for chat-visible plan summary if needed.

---

## Execution Evidence (CLI Audit Snapshot)

### Therapist chat workflow latency (`EBo9At6eCh0S7vkM`)

- Recent sample window: 25 runs
- Mode: webhook
- Outcome: all successful in that window
- Wall time range: ~5s to ~15s (typical ~8s to ~12s; outlier ~15s)

Node-level timing samples (`executionTime`):

- `870` (normal, no discovery): crisis ~4203 ms, therapist ~5170 ms, total LLM ~9.4s
- `864` (normal, no discovery): crisis ~1106 ms, therapist ~4380 ms, total LLM ~5.5s
- `840` (normal + discovery): crisis ~6850 ms, therapist ~5282 ms, discovery ~2334 ms, total LLM ~14.5s
- `846` (crisis branch only): crisis ~3412 ms, no therapist/discovery, total LLM ~3.4s

Interpretation:

- Normal-path slowness is dominated by sequential LLM calls (crisis + therapist).
- Discovery adds approximately ~2.3s when executed inline.
- Crisis model variance alone (~1.1s to ~6.8s observed) explains inconsistent "sometimes slow" user perception.
- Code-node overhead is comparatively small (single-digit ms).

### Branch usage observations

- `846`: `Is Crisis?` -> `Return Crisis Alert` only (fast crisis short-circuit).
- `870 / 864 / 840`: non-crisis path through `Prompt Builder` -> therapist chain.
- `840`: includes discovery agent/model/parser branch.

### Failures, retries, and reliability signals

Therapist workflow error cluster (2026-03-28 ~18:08):

- Multiple webhook error executions in quick succession.
- Retry-mode execution `711` references `retryOf: 710`.
- Execution `710` (`--show-data`) failed in `Prompt Builder` with:
  - `SyntaxError: Unexpected token ','`
  - failure occurred after crisis chain success (~6.4s elapsed before failure)
- Execution `711` stopped almost immediately (~16 ms), indicating retry did not recover deterministic failure.

Interpretation:

- Some failures are Prompt Builder code/format robustness issues, not model-quality issues.
- Retry policy should distinguish deterministic syntax/parser failures from transient failures.

### Session-end orchestrator evidence (`1xntJU9IDNQ3tWle`)

- Success `871` (~16s wall):
  - Summary sub-call ~9218 ms
  - Readiness sub-call ~6131 ms
  - Memory call ~35 ms (orchestrator-level timing context)
- Error `665`:
  - failed on memory agent sub-call after ~5820 ms
  - message class: model output / required format mismatch

Interpretation:

- Structured-output and parser conformance is an explicit reliability risk across chat-adjacent orchestration.

### Contract shape note

- Successful chat outputs are normalized by `Format Final Response` (required fields + optional discovery + `quality_meta` pass-through), consistent with workflow docs.
- CLI table output does not include full response bodies by default; exact payload verification requires node-level output inspection (`Format Final Response` / `Respond to Webhook`) or API JSON export.

### Evidence-driven implications

1. Latency optimization should prioritize reducing serial model calls on the synchronous path.
2. Discovery should be shifted off hot path unless strictly needed inline.
3. Prompt Builder hardening and parser fallback behavior are mandatory for reliability.
4. Retry logic should avoid blind retries for deterministic syntax/format failures.

---

## Actionable Task Backlog

## P0 (High impact, low-medium risk)

- [x] `T-001` Prompt Builder: add `normal_chat` vs `plan_request` response modes.
- [x] `T-002` Therapist model tuning: lower normal-mode token cap and temperature.
- [x] `T-003` Cadence rewrite: conditional validation (remove mandatory acknowledgement every turn).
- [x] `T-004` Anti-repetition guard: suppress repeated stock empathy openers.
- [x] `T-005` Edge telemetry: add request-stage latency metrics.
- [x] `T-006` Exercise policy: broaden early-stage exercise eligibility.

## P1 (High impact, medium risk)

- [x] `T-007` Move discovery to async path and persist updates post-reply.
- [x] `T-008` Add contract-safe fallback for parser/prompt-builder failures.
- [x] `T-009` Improve session-scoped exercise history detection.
- [x] `T-010` Add deterministic early-exercise fallback behavior.
- [x] `T-014` Add discovery-plan chat summary so pathway recommendation details are surfaced directly in assistant reply.
- [x] `T-015` Update formatter/contract handling to carry discovery-plan summary fields safely to edge/client.

## P2 (Hardening and rollout)

- [x] `T-011` Build scenario matrix tests (normal, plan, distress, crisis, early-session exercise).
- [x] `T-012` Validate KPI gates before broad rollout.
- [x] `T-013` Stage rollout with feature flags and rollback controls.
- [x] `T-016` Add scenario coverage for discovery-generated plan visibility in chat (including fallback behavior when discovery is async).

---

## Suggested Owner Split

- n8n workflow engineer:
  - Prompt Builder logic
  - Therapist model settings
  - Discovery routing
  - Response formatter hardening
- Backend/edge engineer:
  - telemetry
  - async orchestration
  - parser-safe fallbacks
  - context optimization
- Clinical + QA reviewers:
  - tone/readability
  - safety validation
  - acceptance criteria signoff

---

## KPI Gates

Use these gates before full rollout:

- Median normal-chat response length decreases.
- Repetitive acknowledgement opener frequency decreases.
- p50/p95 response latency improves.
- Early-session exercise recommendation rate increases.
- Crisis safety behavior does not regress.
- Discovery-generated plan recommendations are visible in chat with clear pathway + rationale + next-step summary.

## Implementation Verification Notes

- `T-007` Async discovery now has a non-blocking path in the edge function when `MC_SYNC_DISCOVERY=false`, with best-effort persistence of pathway proposal metadata and dynamic theme updates.
- `T-008` Prompt Builder now has an explicit deterministic fail-safe return branch, and edge-side parser normalization remains resilient to nested/stringified payload variants.
- `T-011` / `T-016` Scenario matrix is documented in `docs/N8N_THERAPIST_CHAT_VALIDATION_MATRIX.md`, including explicit discovery-plan visibility and async discovery fallback scenarios.
- `T-012` KPI gate definitions are formalized in the validation matrix and are tracked as rollout acceptance gates.
- `T-013` Staged rollout and rollback controls are documented and use feature-flag gating (`MC_SYNC_DISCOVERY`) with defined rollback triggers.

---

## Proposed Payload Example (`plan_summary`)

Use this as the canonical shape for discovery-driven plan visibility in chat.

### n8n -> edge (response payload)

```json
{
  "reply": "I have a pathway that fits what you've shared so far. If you'd like, we can review it together.",
  "crisis_detected": false,
  "suggested_pathway": "anxiety_and_stress_management",
  "pathway_confidence": 0.82,
  "plan_summary": {
    "is_presented": true,
    "pathway_name": "Calm & Coping Plan",
    "pathway_id": "anxiety_and_stress_management",
    "why_this_path": "You are describing persistent anxiety loops, stress spikes, and avoidance patterns.",
    "next_step": "Open the pathway proposal to review phases and choose whether to follow it.",
    "source": "discovery_agent",
    "summary_version": 1
  }
}
```

### edge normalization expectations

- Treat `plan_summary` as optional.
- If `plan_summary.is_presented === true`, pass through to client payload and persist into session/journey metadata as needed.
- If discovery is async and summary is not available in the same turn:
  - return normal reply,
  - hydrate `plan_summary` on subsequent turn/event without breaking contract.

### client rendering expectations

- If `plan_summary.is_presented === true`:
  - show concise inline block in chat with:
    - pathway name,
    - one-line rationale (`why_this_path`),
    - immediate action (`next_step`).
- Keep default state unchanged when `plan_summary` is absent.

