# FnO Copilot Agent QA - Create Algo

Date: 2026-07-06
URL: https://saksham-experiments.com/fno-copilot/agent
Mode: Agent workspace, Create Algo
Raw run artifact: `/Users/sakshamagrawal/Documents/Projects/qa/fno-agent-qa-results-QA-FNO-AGENT-2026-07-06-1783320445331.json`

## Scope

Ran 10 novice-trader Create Algo journeys, 8 turns each, against deployed Supabase Edge Functions and n8n workflow. Also ran one visible UI check in Chrome with `?fno_debug` enabled, then reloaded to verify Recent Chats persistence.

## Case Results

| Case | Turns | Final status | Degraded turns | Notes |
|---|---:|---|---:|---|
| Backtesting + Paper Trading Algo | 8 | ready | 0 | Good. Handles hypothesis, signal edits, cost assumptions, weekday restriction. |
| Risk Management Algo | 8 | needs_input | 0 | Gap. Provides useful risk-engine content but never marks artifact ready. |
| Execution Algo | 8 | ready | 0 | Good. Handles order type, liquidity, retries, slippage changes. |
| Trend-Following Futures Algo | 8 | ready | 1 | One degradation on futures-to-ITM-call pivot. Final turn recovered but prior change was not applied. |
| Hedged Options Spread Algo | 8 | ready | 0 | Good. Handles defined-risk spread and IV filter changes. |
| Volatility-Based Options Algo | 8 | ready | 0 | Starts as needs_input for conceptual turns, becomes ready after IV-percentile rule. |
| Range-Bound Market Algo | 8 | ready | 0 | Good. Handles range detection and mean-reversion comparison. |
| Breakout Option Buying Algo | 8 | needs_input | 0 | Gap. Regressed from ready to needs_input after adding premium momentum / stop-loss details. |
| Expiry-Day Algo | 8 | ready | 0 | Good. Handles paper-only expiry plan and safety limits. |
| Market Regime Classifier Algo | 8 | needs_input | 0 | Gap. Treats classifier-only/meta-algo as incomplete because it expects a tradable structure. |

Summary: 80/80 Edge calls returned HTTP 200. 7/10 cases ended ready. 3/10 ended needs_input. 1/80 turns returned `degraded=true`.

## Persistence And Recent Chats

Backend persistence path is partially working:

- `fno-copilot-session-init` creates `fno_ai_sessions` plus `fno_ai_artifacts`.
- `fno-copilot-chat` appends the user message first, calls n8n, then updates the same session with the assistant reply and updates the artifact payload/status.
- Source evidence: `supabase/functions/fno-copilot-chat/index.ts:126-152`, `205-228`.

But the product requirement is not met:

- Frontend calls `initAgentSession` without a `user_id` in `FnOCopilotApp.tsx:577-582`.
- Frontend calls `sendAgentChat` without a `user_id` in `FnOCopilotApp.tsx:758-762`.
- `Recent Chats` is local React state initialized from starter rows. It is updated only after current-page sends and is not hydrated from Supabase.
- Chrome UI check: after sending a visible Create Algo message, Recent Chats showed the new item. After reload, it reverted to only:
  - `Range trade around OI walls`
  - `Liquid high-IV option scan`
  - `Why does max pain matter?`
- Read-only REST check using the public key returned `[]` for latest `fno_ai_sessions`, consistent with RLS plus `user_id = null`.

Verdict: sessions and artifacts are saved server-side, but older sessions are not visible in Recent Chats and the implementation is not user-specific yet.

## Webhook Context

Pass.

`fno-copilot-chat` sends both top-level and nested payload fields to n8n:

- `chat_history: updatedMessages`
- `current_artifact: artifactData.payload`
- nested `body.chat_history`
- nested `body.current_artifact`

Source evidence: `supabase/functions/fno-copilot-chat/index.ts:169-182`.

n8n execution `4755` confirmed the webhook input contained the full prior conversation for Case 4 and the current artifact payload before the failing pivot turn.

## Artifact Context To Model

Pass.

The n8n execution detail for failed execution `4755` showed `body.current_artifact` with the prior strategy payload. The Rules Author Agent system prompt also includes current artifact state and tells the model to preserve or modify it incrementally.

## n8n Workflow Monitoring

Workflow: `bbglBt58l5MDM1Vl` (`FnO Copilot Sub - Create Algo Strategy v2 (Multi-Agent)`)

Latest execution sample from n8n CLI showed recent integrated executions mostly `success`. One failed execution was captured:

- Execution `4755`
- Status: `error`
- Node: `Rules Author Agent`
- Error: output parsing failure
- User turn: Case 4, turn 7: "Convert the futures exposure to ITM call buying so risk is capped."
- Edge behavior: returned HTTP 200 with `degraded=true` and user-facing fallback: "Sorry - I hit a snag..."

This fallback prevents a hard UI failure, but it leaves the artifact unchanged for that turn.

## Main Gaps

1. Recent Chats is not backed by Supabase.
   - Needs a query on load for current user's `fno_ai_sessions`, joined to latest artifact/session summary.

2. Sessions are not user-specific.
   - Frontend does not pass authenticated `user.id`.
   - Session rows are created with `user_id: null`, so RLS-backed user history cannot work.

3. Meta-algo journeys are poorly supported.
   - Risk Management and Market Regime Classifier remain `needs_input` even after complete user specification.
   - The model/workflow seems biased toward selecting option structures with legs.

4. Breakout Option Buying status regresses.
   - Case 8 starts ready, then becomes `needs_input` after adding more detail.
   - The assistant gives a complete final rule summary while artifact status remains needs_input.

5. Structural pivot can break parser.
   - Futures/protective-put to ITM-call conversion caused Rules Author Agent output parsing failure.

## Recommended Fixes

1. Wire authenticated user id into `initAgentSession` and `sendAgentChat`.
2. Add `loadRecentAgentSessions(userId)` on Agent page mount and after every send.
3. Store and display a stable session title, preview, mode, updated_at, artifact status, and artifact type.
4. Add workflow support for non-trade artifacts: `risk_engine`, `execution_engine`, and `regime_classifier`, or allow these to become ready without option legs.
5. In Compose/Format, prevent ready-to-needs_input regressions unless missing inputs are explicit and shown in the UI.
6. Harden Rules Author Agent output parsing for large current artifacts and structural pivots, especially futures-to-option conversion.
