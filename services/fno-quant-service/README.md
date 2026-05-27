# FnO Co-Pilot Quant Service

FastAPI service intended to run on the same VPS pattern as Trading Agents. It owns Upstox connectivity, normalized option-chain data, derived calculations, top-5 trade scoring, backtesting, and paper mark-to-market.

The MVP starts in demo mode and returns deterministic NIFTY data.

## Upstox Analytics Token

Copy `.env.example` to `.env` and set `UPSTOX_ANALYTICS_TOKEN` from the Upstox Developer Apps → Analytics tab. Never commit `.env`.

```bash
UPSTOX_ENV=production
UPSTOX_ANALYTICS_TOKEN=<token>
```

When the token is set, `mode=live` (or `auto`) uses Upstox; otherwise the service falls back to demo data.

## Local run

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8010
```

## Endpoints

- `GET /health`
- `POST /market/snapshot`
- `POST /compute/overview`
- `POST /compute/chain`
- `POST /compute/top5`
- `POST /compute/backtest`
- `POST /compute/mark-paper`
