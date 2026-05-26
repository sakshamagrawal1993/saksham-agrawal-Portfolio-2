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
