# Product -> Edge Function -> Workflow Map

Last updated: 2026-05-26

This document maps each product flow from frontend trigger to Supabase Edge Function and then to the n8n workflow (or non-n8n backend) it reaches.

## Health Twin

### 1) Health Twin Chat
- Frontend trigger:
  - `components/HealthTwin/CenterPanel.tsx`
  - `supabase.functions.invoke('chat-completion', { twin_id, session_id, message_text, personal_details_snapshot })`
- Edge Function:
  - `supabase/functions/chat-completion/index.ts`
- Edge -> workflow routing:
  - URL secret: `N8N_HEALTH_TWIN_CHAT_WEBHOOK_URL` (preferred) or `N8N_WEBHOOK_CHAT_URL` (fallback)
  - Secret header: `N8N_HEALTH_TWIN_CHAT_WEBHOOK_SECRET` (preferred) or `N8N_WEBHOOK_SECRET` (fallback), sent as `x-n8n-secret`
  - Safety guard: rejects misconfiguration if webhook URL path contains `trading-agents-run`
- n8n workflow target:
  - Workflow definition: `n8n-workflows/definitions/health-twin-chat__QmbwB8UJcN8PNbrd.json`
  - Webhook path: `2baf5b34-fe22-4404-bcef-44200cb038f5`

### 2) Health Twin Lab Report Processing
- Frontend trigger:
  - `components/HealthTwin/LeftPanel.tsx`
  - `supabase.functions.invoke('process-lab-report', { file_url, twin_id, file_id })`
- Edge Function:
  - `supabase/functions/process-lab-report/index.ts`
- Edge -> workflow routing:
  - URL secret: `N8N_HEALTH_TWIN_LAB_WEBHOOK_URL` (preferred) or `N8N_Health_Twin_WEBHOOK_LAB_URL` (fallback)
  - Secret header: `N8N_HEALTH_TWIN_LAB_WEBHOOK_SECRET` (preferred) or `N8N_WEBHOOK_SECRET` (fallback), sent as `x-n8n-secret`
  - Safety guard: rejects misconfiguration if webhook URL path contains `trading-agents-run`
- n8n workflow target:
  - Workflow definition: `n8n-workflows/definitions/lab-report-processing__9GaGrmxlOtPD3PDm.json`
  - Webhook path: `fbf6b968-5838-4590-ae61-4b754c50843a`

### 3) Health Twin Playground Wellness Simulation
- Frontend trigger:
  - `store/playgroundStore.ts`
  - `supabase.functions.invoke('generate-wellness-playground', { playground_state, computed_scores })`
- Edge Function:
  - `supabase/functions/generate-wellness-playground/index.ts`
- Backend target:
  - Direct OpenAI API calls (`gpt-4o-mini`)
  - No n8n workflow in this path

## AI Gate

### AI Gating Analysis Execute
- Frontend trigger:
  - `components/AIGate/aiGateApi.ts`
  - `supabase.functions.invoke('ai-gating-evaluate', { title, idea_text, source, preset_id, ... })`
- Edge Function:
  - `supabase/functions/ai-gating-evaluate/index.ts`
- Edge -> workflow routing:
  - URL secret: `AI_GATE_N8N_WEBHOOK_URL`
  - Secret header: `AI_GATE_N8N_WEBHOOK_SECRET`, sent as `x-n8n-secret`
  - Safety guard: rejects misconfiguration if webhook URL path contains `trading-agents-run`
  - Fallback: if n8n URL/secret is unavailable or n8n call fails, function runs internal fallback evaluator
- n8n workflow target:
  - Workflow definition: `n8n-workflows/definitions/ai-gating-lab-evaluator__CM13VfPCeGYmXoCe.json`
  - Webhook path: `ai-gating-lab-evaluate`

## Trading Agents

### 1) Supervisor Run
- Frontend trigger:
  - `components/TradingAgents/TradingAgentsApp.tsx`
  - `invokeTradingAgents({ action: 'run', ticker, session_id, execution_price, market, ... })`
- Edge Function:
  - `supabase/functions/trading-agents-proxy/index.ts`
- Edge -> workflow routing:
  - URL secret: `TRADING_AGENTS_RUN_WEBHOOK_URL` (preferred) or `N8N_WEBHOOK_URL` (fallback)
  - Secret header: `TRADING_AGENTS_N8N_WEBHOOK_SECRET` (preferred) or `N8N_WEBHOOK_SECRET` (fallback), sent as `x-trading-agents-secret`
- n8n workflow target:
  - Workflow definition: `n8n-workflows/definitions/tradingagents-supervisor-orchestrator__UDRkHgYzqs3GBaat.json`
  - Webhook path: `trading-agents-run`

### 2) Recon Screener
- Frontend trigger:
  - `components/TradingAgents/TradingAgentsApp.tsx`
  - `invokeTradingAgents({ action: 'recon', tickers })`
- Edge Function:
  - `supabase/functions/trading-agents-proxy/index.ts`
- Edge -> workflow routing:
  - URL secret: `TRADING_AGENTS_RECON_WEBHOOK_URL` (preferred), otherwise falls back to `N8N_RECON_WEBHOOK_URL`, then run URL fallback
  - Secret header: `TRADING_AGENTS_N8N_WEBHOOK_SECRET` (preferred) or `N8N_WEBHOOK_SECRET` (fallback), sent as `x-trading-agents-secret`
- n8n workflow target:
  - Workflow definition: `n8n-workflows/definitions/tradingagents-recon-screener__sqhpR7pc8WqFXOUY.json`
  - Webhook path: `trading-agents-recon`

## InsightsLM

### 1) Source Processing
- Frontend trigger:
  - `components/InsightsLM/Workspace/NotebookLayout.tsx`
  - `supabase.functions.invoke('process-source', { source_id, notebook_id, file_url, source_type, file_name })`
- Edge Function:
  - `supabase/functions/process-source/index.ts`
- Edge -> workflow routing:
  - URL secret: `INSIGHTSLM_SOURCE_WEBHOOK_URL` (preferred) or `N8N_WEBHOOK_URL` (fallback)
  - Secret header: `INSIGHTSLM_SOURCE_WEBHOOK_SECRET` (preferred) or `N8N_WEBHOOK_SECRET` (fallback), sent as `x-n8n-secret`
  - Safety guard: rejects misconfiguration if webhook URL path contains `trading-agents-run`
- Expected n8n workflow (by payload contract):
  - Workflow definition: `n8n-workflows/definitions/insightslm-summary-generator__BLf8nGNjezv5HYld.json`
  - Webhook path: `7b9bb8e0-68fa-463f-87f2-2cf0bb1db4e6`
  - Evidence: workflow uses `source_id` and `notebook_id` in webhook body

### 2) Notebook Chat
- Frontend trigger:
  - `components/InsightsLM/Workspace/NotebookLayout.tsx`
  - `supabase.functions.invoke('chat-notebook', { message, notebook_id })`
- Edge Function:
  - `supabase/functions/chat-notebook/index.ts`
- Edge -> workflow routing:
  - URL secret: `INSIGHTSLM_CHAT_WEBHOOK_URL` (preferred), then `N8N_WEBHOOK_CHAT_URL`, then `N8N_WEBHOOK_URL`
  - Secret header: `INSIGHTSLM_CHAT_WEBHOOK_SECRET` (preferred) or `N8N_WEBHOOK_SECRET` (fallback), sent as `x-n8n-secret`
  - Safety guard: rejects misconfiguration if webhook URL path contains `trading-agents-run`
- Expected n8n workflow:
  - Workflow definition: `n8n-workflows/definitions/insightslm-chat-agent__eOcEyrZMbGUFn2Hg.json`
  - Webhook path: `chat`

## Mind Coach

### 1) Session Start
- Frontend triggers:
  - `components/MindCoach/shared/sessionLifecycle.ts`
  - `supabase.functions.invoke('mind-coach-session-start', { profile_id })`
- Edge Function:
  - `supabase/functions/mind-coach-session-start/index.ts`
- Backend target:
  - Supabase DB only (session/journey orchestration)
  - No n8n workflow in this path

### 2) Chat
- Frontend trigger:
  - `components/MindCoach/Chat/TherapistChat.tsx`
  - `supabase.functions.invoke('mind-coach-chat', payload)`
- Edge Function:
  - `supabase/functions/mind-coach-chat/index.ts`
- Edge -> workflow routing:
  - URL secret: `MC_N8N_CHAT_WEBHOOK_URL` (fallback hardcoded to `https://n8n.saksham-experiments.com/webhook/mind-coach-chat`)
  - Discovery URL secret: `MC_N8N_DISCOVERY_WEBHOOK_URL` (fallback to chat webhook URL)
  - Secret header: `MC_N8N_WEBHOOK_SECRET`, sent as `x-n8n-secret`
- n8n workflow target:
  - Workflow definition: `n8n-workflows/definitions/mind-coach-therapist-chat-and-discovery-v6-robust__EBo9At6eCh0S7vkM.json`
  - Webhook path: `mind-coach-chat`

### 3) Session End
- Frontend triggers:
  - `components/MindCoach/Chat/TherapistChat.tsx`
  - `components/MindCoach/Screens/DiaryScreen.tsx`
  - both call `supabase.functions.invoke('mind-coach-session-end', { session_id, profile_id, ... })`
- Edge Function:
  - `supabase/functions/mind-coach-session-end/index.ts`
- Edge -> workflow routing:
  - URL secret: `MC_N8N_SESSION_END_WEBHOOK_URL` (fallback hardcoded placeholder URL)
  - Secret header: `MC_N8N_WEBHOOK_SECRET`, sent as `x-n8n-secret`
- n8n workflow target:
  - Workflow definition: `n8n-workflows/definitions/mind-coach-session-end-orchestrator-v6-execute-workflow__1xntJU9IDNQ3tWle.json`
  - Webhook path: `mind-coach-session-end`

## FnO Co-Pilot

Canonical deployment: portfolio route `/fno-copilot` on `saksham-experiments.com`. See [FNO_COPILOT_DEPLOYMENT.md](./FNO_COPILOT_DEPLOYMENT.md).

### 1) Bootstrap / market shell
- Frontend trigger:
  - `components/FnOCopilot/FnOCopilotApp.tsx`
  - `components/FnOCopilot/fnoCopilotApi.ts` → `invokeFnOCopilot({ action: 'bootstrap' })` when `VITE_FNO_COPILOT_USE_EDGE` is enabled
- Edge Function:
  - `supabase/functions/fno-copilot-proxy/index.ts`
- Backend target:
  - Demo payloads inline in edge function today
  - Planned: `FNO_COPILOT_VPS_URL` for quant service, Postgres reads for snapshots

### 2) Agent chat (Find Trade / Create Algo / Screener / Ask AI)
- Frontend trigger:
  - `components/FnOCopilot/FnOCopilotApp.tsx` (`sendMessage`)
  - Maps `UserMode` → edge actions `ai_ask`, `ai_create_trade`, `ai_create_algo_strategy`, `ai_create_screener`
- Edge Function:
  - `supabase/functions/fno-copilot-proxy/index.ts`
- Edge -> workflow routing (planned; not wired in edge yet):
  - URL secrets: `FNO_COPILOT_N8N_WEBHOOK_URL` (per workflow) or dedicated URLs below
  - Secret header: `FNO_COPILOT_N8N_WEBHOOK_SECRET`, sent as `x-n8n-secret`
- n8n workflow targets:
  - Find trade: `n8n-workflows/definitions/fno-copilot-find-trade-chat__fnoFindTrade20260526.json` → `fno-copilot-find-trade-chat`
  - Create algo: `n8n-workflows/definitions/fno-copilot-create-algo-strategy-chat__fnoAlgoStrategy20260526.json` → `fno-copilot-create-algo-strategy-chat`
  - AI ask: `n8n-workflows/definitions/fno-copilot-ai-ask__fnoAiAsk20260526.json` → `fno-copilot-ai-ask`
  - Screener: `n8n-workflows/definitions/fno-copilot-option-screener__fnoScreener20260526.json` → `fno-copilot-option-screener`

### 3) Backtest / paper trade (planned)
- Edge actions: `backtest`, `backtest_trade`, `backtest_algo_strategy`, `paper_trade_create`, `paper_trade_mark`, `paper_trade_close`
- n8n workflow targets:
  - `fno-copilot-backtest-runner__fnoBacktest20260526.json` → `fno-copilot-backtest-runner`
  - `fno-copilot-paper-trade-journal__fnoPaperJournal20260526.json` → `fno-copilot-paper-trade-journal`

### 4) Top 5 / market insight refresh (planned)
- n8n workflow targets:
  - `fno-copilot-top5-refresh__fnoTop520260526.json` (scheduled)
  - `fno-copilot-market-insight-refresh__fnoInsight20260526.json` (scheduled)

Contract details: [FNO_COPILOT_WORKFLOW_CONTRACTS.md](./FNO_COPILOT_WORKFLOW_CONTRACTS.md)

## Products With No Active Edge->n8n Path Found
- Ticketflow
- Runner
- Medical Benchmark
- Unity Card
- Blog/Dashboard/Admin flows

## Notes
- Some routes are resolved entirely by secret values at runtime. Where exact URL values are hidden, this document maps workflow targets by webhook payload contracts and workflow definitions.
- To prevent cross-product misroutes, each product should use product-scoped URL+secret env vars instead of shared `N8N_WEBHOOK_URL`/`N8N_WEBHOOK_SECRET`.
