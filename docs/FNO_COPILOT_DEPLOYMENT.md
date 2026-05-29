# FnO Co-Pilot Deployment (Portfolio-Only)

## Production URLs

| Surface | URL |
| --- | --- |
| Product UI | `https://saksham-experiments.com/fno-copilot` |
| Supabase Edge | `{SUPABASE_URL}/functions/v1/fno-copilot-proxy` |
| Quant service (VPS) | Host your FastAPI app from `services/fno-quant-service/` |

## Retired standalone stack

- GitHub: `sakshamagrawal1993/fno-copilot` (archived)
- Vercel: `fno-copilot.vercel.app` (project removed)

All new changes belong in **saksham-agrawal-Portfolio-2** only.

## Upstox Analytics Token (read-only live data)

Generate the token from [Upstox Developer Apps → Analytics](https://upstox.com/developer/apps) (1-year validity, no OAuth).

### Local quant service

```bash
# services/fno-quant-service/.env  (never commit)
UPSTOX_ENV=production
UPSTOX_ANALYTICS_TOKEN=<your_token>
```

```bash
cd services/fno-quant-service
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8010
```

Smoke test:

```bash
curl http://localhost:8010/health
curl -X POST http://localhost:8010/compute/chain -H "Content-Type: application/json" -d '{"instrument":"NIFTY","mode":"live"}'
```

### Supabase Edge (production UI)

The edge function reads `UPSTOX_ANALYTICS_TOKEN` and fetches live NIFTY chain data directly from Upstox (no VPS required for MVP).

```bash
npx supabase secrets set UPSTOX_ANALYTICS_TOKEN="<your_token>"
npx supabase functions deploy fno-copilot-proxy
```

Optional: point edge at your VPS quant service instead of calling Upstox directly:

```bash
npx supabase secrets set FNO_QUANT_SERVICE_URL="https://your-vps-host:8010"
```

### VPS (optional, recommended later)

You do **not** need a separate server for the first live-data test if Supabase secrets are set.  
Your existing cloud server (used for yfinance) can later host `fno-quant-service` on port `8010` for caching, backtests, and rate-limit isolation — same pattern as Trading Agents research proxy.

## Upstox OAuth redirect

Register this redirect URI in the Upstox developer console:

```text
https://saksham-experiments.com/fno-copilot
```

Local quant service env (see `services/fno-quant-service/README.md`):

```bash
UPSTOX_REDIRECT_URI=https://saksham-experiments.com/fno-copilot
```

Do **not** use `https://fno-copilot.vercel.app/` — that deployment is decommissioned.

## Optional: enable Edge from the UI

```bash
# .env.local (portfolio root)
VITE_FNO_COPILOT_USE_EDGE=true
```

Requires `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`. When enabled, the app calls `fno-copilot-proxy` for bootstrap and chat; calculations still run client-side until live data is wired.

Deploy the edge function:

```bash
npx supabase functions deploy fno-copilot-proxy
```

Apply migrations if not already applied:

```bash
npx supabase db push
```

## Agent mode (session + chat + n8n orchestrator)

Production Agent mode uses:

| Component | Path / webhook |
| --- | --- |
| Session bootstrap | `{SUPABASE_URL}/functions/v1/fno-copilot-session-init` |
| Multi-turn chat | `{SUPABASE_URL}/functions/v1/fno-copilot-chat` |
| n8n orchestrator | `https://n8n.saksham-experiments.com/webhook/fno-copilot-orchestrator` |

Deploy edge functions:

```bash
npx supabase functions deploy fno-copilot-session-init
npx supabase functions deploy fno-copilot-chat
```

`supabase/config.toml` sets `verify_jwt = false` for both functions so the browser can call them with the Supabase publishable key.

Canonical production n8n workflow IDs (see `n8n-workflows/docs/FNO_COPILOT_PRODUCTION_WORKFLOWS.md`):

- Orchestrator: `yyp51iatyjXavk9h`
- Create algo: `Rxrupl24ohSIvzZS`
- Create trade: `0m9b9f6wQ204M3CM`
- Screener: `jn2SFm0wJGvFveHc`
- Ask AI: `QsxXQETqoLgERuJy`

Smoke test (production):

```bash
node scripts/fno_prod_agent_e2e.mjs
```

Or open `https://saksham-experiments.com/fno-copilot?fno_debug=1`, switch to **Agent** → **Create Algo**, and confirm `fno-copilot-session-init` / `fno-copilot-chat` return HTTP 200.
