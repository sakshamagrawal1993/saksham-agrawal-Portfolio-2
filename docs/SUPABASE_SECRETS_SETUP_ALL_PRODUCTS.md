# Supabase Secrets Setup (All Products)

Last updated: 2026-05-26

This is a complete setup template for product-scoped webhook secrets across all active products.

## 1) Set your n8n base URL and per-product secrets

Use your actual values. If you are not rotating secrets yet, you can temporarily use one shared secret string for all products.

```bash
# --- REQUIRED: set your base URL ---
export N8N_BASE_URL="https://n8n.saksham-experiments.com"

# --- REQUIRED: set per-product secret strings ---
export HEALTH_TWIN_CHAT_SECRET="<set-strong-secret>"
export HEALTH_TWIN_LAB_SECRET="<set-strong-secret>"
export AI_GATE_SECRET="<set-strong-secret>"
export INSIGHTSLM_SOURCE_SECRET="mTuhEe3JKWUxmUnG"   # must match n8n credential InsightsLm_Auth
export INSIGHTSLM_CHAT_SECRET="mTuhEe3JKWUxmUnG"     # must match n8n credential InsightsLm_Auth
export TRADING_AGENTS_SECRET="<set-strong-secret>"
export MIND_COACH_SECRET="<set-strong-secret>"
export FNO_COPILOT_SECRET="<set-strong-secret>"
export FNO_COPILOT_VPS_SECRET="<set-strong-secret>"

# Optional: if discovery uses a dedicated webhook, set this too
export MIND_COACH_DISCOVERY_URL="${N8N_BASE_URL}/webhook/mind-coach-chat"
```

## 2) Apply all product-scoped Supabase secrets

Run from repo root:

```bash
npx supabase secrets set \
  N8N_HEALTH_TWIN_CHAT_WEBHOOK_URL="${N8N_BASE_URL}/webhook/2baf5b34-fe22-4404-bcef-44200cb038f5" \
  N8N_HEALTH_TWIN_CHAT_WEBHOOK_SECRET="${HEALTH_TWIN_CHAT_SECRET}" \
  N8N_HEALTH_TWIN_LAB_WEBHOOK_URL="${N8N_BASE_URL}/webhook/fbf6b968-5838-4590-ae61-4b754c50843a" \
  N8N_HEALTH_TWIN_LAB_WEBHOOK_SECRET="${HEALTH_TWIN_LAB_SECRET}" \
  AI_GATE_N8N_WEBHOOK_URL="${N8N_BASE_URL}/webhook/ai-gating-lab-evaluate" \
  AI_GATE_N8N_WEBHOOK_SECRET="${AI_GATE_SECRET}" \
  INSIGHTSLM_SOURCE_WEBHOOK_URL="${N8N_BASE_URL}/webhook/7b9bb8e0-68fa-463f-87f2-2cf0bb1db4e6" \
  INSIGHTSLM_SOURCE_WEBHOOK_SECRET="${INSIGHTSLM_SOURCE_SECRET}" \
  INSIGHTSLM_CHAT_WEBHOOK_URL="${N8N_BASE_URL}/webhook/chat" \
  INSIGHTSLM_CHAT_WEBHOOK_SECRET="${INSIGHTSLM_CHAT_SECRET}" \
  TRADING_AGENTS_RUN_WEBHOOK_URL="${N8N_BASE_URL}/webhook/trading-agents-run" \
  TRADING_AGENTS_RECON_WEBHOOK_URL="${N8N_BASE_URL}/webhook/trading-agents-recon" \
  TRADING_AGENTS_N8N_WEBHOOK_SECRET="${TRADING_AGENTS_SECRET}" \
  MC_N8N_CHAT_WEBHOOK_URL="${N8N_BASE_URL}/webhook/mind-coach-chat" \
  MC_N8N_DISCOVERY_WEBHOOK_URL="${MIND_COACH_DISCOVERY_URL}" \
  MC_N8N_SESSION_END_WEBHOOK_URL="${N8N_BASE_URL}/webhook/mind-coach-session-end" \
  MC_N8N_WEBHOOK_SECRET="${MIND_COACH_SECRET}" \
  FNO_COPILOT_FIND_TRADE_WEBHOOK_URL="${N8N_BASE_URL}/webhook/fno-copilot-find-trade-chat" \
  FNO_COPILOT_ALGO_STRATEGY_WEBHOOK_URL="${N8N_BASE_URL}/webhook/fno-copilot-create-algo-strategy-chat" \
  FNO_COPILOT_AI_ASK_WEBHOOK_URL="${N8N_BASE_URL}/webhook/fno-copilot-ai-ask" \
  FNO_COPILOT_SCREENER_WEBHOOK_URL="${N8N_BASE_URL}/webhook/fno-copilot-option-screener" \
  FNO_COPILOT_BACKTEST_WEBHOOK_URL="${N8N_BASE_URL}/webhook/fno-copilot-backtest-runner" \
  FNO_COPILOT_PAPER_JOURNAL_WEBHOOK_URL="${N8N_BASE_URL}/webhook/fno-copilot-paper-trade-journal" \
  FNO_COPILOT_N8N_WEBHOOK_SECRET="${FNO_COPILOT_SECRET}" \
  FNO_COPILOT_SERVICE_SECRET="${FNO_COPILOT_SECRET}" \
  FNO_COPILOT_VPS_URL="https://<your-vps-host>" \
  FNO_COPILOT_VPS_SECRET="${FNO_COPILOT_VPS_SECRET}"
```

## 3) Keep legacy keys during migration (recommended)

These are still used by fallback code paths. Keep them set until all clients/functions are fully migrated.

```bash
npx supabase secrets set \
  N8N_WEBHOOK_CHAT_URL="${N8N_BASE_URL}/webhook/chat" \
  N8N_Health_Twin_WEBHOOK_LAB_URL="${N8N_BASE_URL}/webhook/fbf6b968-5838-4590-ae61-4b754c50843a" \
  N8N_RECON_WEBHOOK_URL="${N8N_BASE_URL}/webhook/trading-agents-recon"
```

## 4) Deploy affected edge functions

```bash
npx supabase functions deploy chat-completion
npx supabase functions deploy process-lab-report
npx supabase functions deploy ai-gating-evaluate
npx supabase functions deploy process-source
npx supabase functions deploy chat-notebook
npx supabase functions deploy trading-agents-proxy
npx supabase functions deploy fno-copilot-proxy
```

## 5) Verify secrets exist

```bash
npx supabase secrets list
```

Expected names should include:

- Health Twin:
  - `N8N_HEALTH_TWIN_CHAT_WEBHOOK_URL`
  - `N8N_HEALTH_TWIN_CHAT_WEBHOOK_SECRET` (must match n8n Health Twin chat credential — not `InsightsLm_Auth`)
  - `N8N_HEALTH_TWIN_LAB_WEBHOOK_URL`
  - `N8N_HEALTH_TWIN_LAB_WEBHOOK_SECRET` (uses `InsightsLm_Auth` in n8n)
- AI Gate:
  - `AI_GATE_N8N_WEBHOOK_URL`
  - `AI_GATE_N8N_WEBHOOK_SECRET`
- InsightsLM:
  - `INSIGHTSLM_SOURCE_WEBHOOK_URL`
  - `INSIGHTSLM_SOURCE_WEBHOOK_SECRET` (**required** — do not rely on `N8N_WEBHOOK_SECRET` fallback unless it matches n8n `InsightsLm_Auth`)
  - `INSIGHTSLM_CHAT_WEBHOOK_URL`
  - `INSIGHTSLM_CHAT_WEBHOOK_SECRET` (**required** — same credential as source)
- Trading Agents:
  - `TRADING_AGENTS_RUN_WEBHOOK_URL`
  - `TRADING_AGENTS_RECON_WEBHOOK_URL`
  - `TRADING_AGENTS_N8N_WEBHOOK_SECRET`
  - `TRADING_AGENTS_ADMIN_TOKEN` (Edge `evaluate`; must match n8n credential **Trading Agents Eval Admin**)
- Mind Coach:
  - `MC_N8N_CHAT_WEBHOOK_URL`
  - `MC_N8N_DISCOVERY_WEBHOOK_URL`
  - `MC_N8N_SESSION_END_WEBHOOK_URL`
  - `MC_N8N_WEBHOOK_SECRET`
- FnO Co-Pilot:
  - `FNO_COPILOT_FIND_TRADE_WEBHOOK_URL`
  - `FNO_COPILOT_ALGO_STRATEGY_WEBHOOK_URL`
  - `FNO_COPILOT_AI_ASK_WEBHOOK_URL`
  - `FNO_COPILOT_SCREENER_WEBHOOK_URL`
  - `FNO_COPILOT_BACKTEST_WEBHOOK_URL`
  - `FNO_COPILOT_PAPER_JOURNAL_WEBHOOK_URL`
  - `FNO_COPILOT_N8N_WEBHOOK_SECRET`
  - `FNO_COPILOT_SERVICE_SECRET`
  - `FNO_COPILOT_VPS_URL`
  - `FNO_COPILOT_VPS_SECRET`

## Notes

- n8n workflow paths used above come from current workflow definitions in `n8n-workflows/definitions`.
- Product isolation is now enforced in updated edge functions for Health Twin, AI Gate, and InsightsLM via URL-path guards against accidental Trading Agents routing.
