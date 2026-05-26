# FnO Co-Pilot MVP Technical Architecture

Canonical home: **saksham-agrawal-Portfolio-2** at route `/fno-copilot`.

The standalone `fno-copilot` GitHub repo and `fno-copilot.vercel.app` deployment were retired in favor of this portfolio embed.

## Runtime modules

| Layer | Module | Responsibility |
| --- | --- | --- |
| Frontend | React (`components/FnOCopilot/`) | Chat workspace, option-chain views, top-5 trade cards, artifact review, paper-trade views |
| Control plane | Supabase Edge `fno-copilot-proxy` | AuthZ, schema validation, idempotency, workflow dispatch, signed service calls |
| Storage | Supabase Postgres + Realtime | Canonical market snapshots, candidates, chat sessions, strategies, backtests, paper trades, workflow logs |
| Workflow | n8n | AI clarification loops, structured artifact generation, backtest orchestration, journal generation |
| Quant runtime | `services/fno-quant-service` (FastAPI) | Upstox connectivity, option-chain analytics, scoring, backtests, paper marking |

## MVP Edge actions

- `bootstrap`
- `market_overview`
- `option_chain`
- `top5_trades`
- `chat_message`
- `finalize_trade`
- `finalize_algo_strategy`
- `backtest`
- `paper_trade_create`
- `paper_trade_mark`
- `paper_trade_close`
- `append_workflow_log`

All responses use this envelope:

```json
{
  "ok": true,
  "action": "top5_trades",
  "requestId": "uuid",
  "data": {}
}
```

Errors use:

```json
{
  "ok": false,
  "action": "top5_trades",
  "requestId": "uuid",
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Human readable error"
  }
}
```

## Calculation modules

### Quote quality

- `mid = (bid + ask) / 2`
- `spread_abs = ask - bid`
- `spread_pct = spread_abs / mid`
- `quote_age_sec = now_ts - quote_ts`
- `depth_notional = (best_bid_qty + best_ask_qty) * mid * lot_size`

Hard reject:

- stale quote beyond threshold
- missing bid/ask
- spread above configured limit
- OI below threshold on any required leg

### Chain analytics

- PCR by OI and volume
- Max pain by minimizing aggregate option payout
- OI walls by highest OI and highest OI change
- ATM straddle expected move
- IV expected move
- 25-delta skew proxy
- Term-structure slope

### Trade scoring

```text
score = 0.25 * liquidity
      + 0.20 * risk_reward
      + 0.20 * regime_fit
      + 0.15 * vol_fit
      + 0.10 * data_confidence
      + 0.10 * simplicity
```

Every persisted candidate must store the full score component vector and rejection reasons.

## Workflow state machine

All async work uses:

```text
queued -> running -> waiting_input -> completed
                         |             |
                         v             v
                      cancelled       failed
```

`fno_workflow_logs` is the shared Realtime stream for frontend status.

## MVP delivery slices

1. Platform foundation: schema, Edge router, Realtime logs.
2. Market data: demo mode, Upstox adapter contract, chain analytics.
3. Top 5 engine: strategy templates, validators, scoring, UI.
4. AI workflows: n8n Find Trade and Create Algo Strategy skeletons.
5. Simulation loop: backtest and paper-trade contracts.

## Frontend ↔ Edge integration

Set `VITE_FNO_COPILOT_USE_EDGE=true` (default when Supabase env vars exist) to route chat and bootstrap through `fno-copilot-proxy`. Client helpers live in `components/FnOCopilot/fnoCopilotApi.ts`. Calculations remain client-side until live market mode replaces embedded Excel data.
