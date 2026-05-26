# FnO Co-Pilot Quant Service

FastAPI service intended to run on the same VPS pattern as Trading Agents. It owns Upstox connectivity, normalized option-chain data, derived calculations, top-5 trade scoring, backtesting, and paper mark-to-market.

The MVP starts in demo mode and returns deterministic NIFTY data.

## Upstox sandbox configuration

Keep Upstox credentials in the process environment only. Do not expose them
through Vite or commit them to git.

```bash
UPSTOX_ENV=sandbox
UPSTOX_CLIENT_ID=
UPSTOX_CLIENT_SECRET=
UPSTOX_REDIRECT_URI=https://saksham-experiments.com/fno-copilot
UPSTOX_ACCESS_TOKEN=
```

**OAuth note:** FnO Co-Pilot is deployed only inside the portfolio at `/fno-copilot`. The retired standalone `fno-copilot.vercel.app` URL must not be used as an Upstox redirect. See `docs/FNO_COPILOT_DEPLOYMENT.md`.

`UPSTOX_CLIENT_ID` is the Upstox API Key. `UPSTOX_CLIENT_SECRET` is the Upstox
API Secret. `UPSTOX_ACCESS_TOKEN` can be used for sandbox market-data
experiments until the OAuth callback and token refresh flow are implemented.

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
