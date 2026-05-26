# FnO Co-Pilot n8n Workflow Contracts

Workflow definitions live in the sibling repo:

```text
n8n-workflows/definitions/
```

## `fno-copilot-find-trade-chat`

- Definition: `fno-copilot-find-trade-chat__fnoFindTrade20260526.json`
- Webhook path: `fno-copilot-find-trade-chat`

Input from Edge:

```json
{
  "workflow_type": "find_trade",
  "chat_session_id": "uuid",
  "user_id": "uuid",
  "instrument": "NIFTY",
  "expiry": "2026-05-28",
  "messages": [],
  "market_context": {
    "snapshot_id": "uuid",
    "quality_flags": []
  }
}
```

Output to Edge `finalize_trade`:

```json
{
  "artifact_type": "trade",
  "chat_session_id": "uuid",
  "title": "Range Credit: Iron Condor",
  "strategy": "Iron Condor",
  "legs": [],
  "filters": [],
  "entry_rules": [],
  "exit_rules": [],
  "risk_rules": [],
  "assumptions": {},
  "educational_disclaimer": true
}
```

## `fno-copilot-create-algo-strategy-chat`

- Definition: `fno-copilot-create-algo-strategy-chat__fnoAlgoStrategy20260526.json`
- Webhook path: `fno-copilot-create-algo-strategy-chat`

Input from Edge:

```json
{
  "workflow_type": "create_algo_strategy",
  "chat_session_id": "uuid",
  "user_id": "uuid",
  "messages": [],
  "supported_templates": ["Iron Condor", "Bull Call Spread"]
}
```

Output to Edge `finalize_algo_strategy`:

```json
{
  "artifact_type": "algo_strategy",
  "name": "Range Credit Strategy",
  "universe": {},
  "filters": [],
  "entry_rules": [],
  "exit_rules": [],
  "risk_rules": [],
  "backtest_plan": {},
  "paper_trade_plan": {}
}
```

## `fno-copilot-top5-refresh`

- Definition: `fno-copilot-top5-refresh__fnoTop520260526.json`
- Trigger: scheduled / internal (no public webhook in definition export)

Input:

```json
{
  "instrument": "NIFTY",
  "expiry": "2026-05-28",
  "refresh_reason": "scheduled"
}
```

Output:

```json
{
  "instrument": "NIFTY",
  "expiry": "2026-05-28",
  "candidate_count": 5,
  "quality_flags": [],
  "model_version": "top5-v0.1"
}
```

## Other FnO workflows

| Workflow | Definition file | Webhook path |
| --- | --- | --- |
| AI ask | `fno-copilot-ai-ask__fnoAiAsk20260526.json` | `fno-copilot-ai-ask` |
| Option screener | `fno-copilot-option-screener__fnoScreener20260526.json` | `fno-copilot-option-screener` |
| Backtest runner | `fno-copilot-backtest-runner__fnoBacktest20260526.json` | `fno-copilot-backtest-runner` |
| Paper trade journal | `fno-copilot-paper-trade-journal__fnoPaperJournal20260526.json` | `fno-copilot-paper-trade-journal` |
| Market insight refresh | `fno-copilot-market-insight-refresh__fnoInsight20260526.json` | scheduled |

See [FNO_COPILOT_ARCHITECTURE.md](./FNO_COPILOT_ARCHITECTURE.md) for the edge action list and [PRODUCT_EDGE_FUNCTION_WORKFLOW_MAP.md](./PRODUCT_EDGE_FUNCTION_WORKFLOW_MAP.md) for frontend → edge → n8n routing.
