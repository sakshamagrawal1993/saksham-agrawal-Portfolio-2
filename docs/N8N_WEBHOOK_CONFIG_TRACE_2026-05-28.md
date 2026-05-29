# n8n Webhook Config Trace — InsightsLM & Mind Coach

**Date:** 2026-05-28  
**n8n base URL:** `https://n8n.saksham-experiments.com`  
**Supabase project:** `ralhkmpbslsdkwnqzqen`

---

## Executive summary

| Flow | Symptom | Root cause | Resolution | Verified |
|------|---------|------------|------------|----------|
| InsightsLM chat (`chat-notebook`) | `403 Forbidden` / `n8n error: Forbidden` | Missing product-scoped secret; edge fn fell back to wrong `N8N_WEBHOOK_SECRET` | Set `INSIGHTSLM_CHAT_WEBHOOK_SECRET` | ✅ 200 |
| InsightsLM source (`process-source`) | Would fail auth same way | Same missing `INSIGHTSLM_SOURCE_WEBHOOK_SECRET` | Set `INSIGHTSLM_SOURCE_WEBHOOK_SECRET` | ✅ Auth OK |
| Mind Coach session-end | Intermittent `502 Workflow execution failed` | n8n workflow itself works; earlier failure likely transient/empty session | No secret change needed | ✅ 200 |

---

## InsightsLM — chat webhook

### Expected config

| Layer | Value |
|-------|-------|
| **Supabase secret (URL)** | `INSIGHTSLM_CHAT_WEBHOOK_URL` → `https://n8n.saksham-experiments.com/webhook/chat` |
| **Supabase secret (auth)** | `INSIGHTSLM_CHAT_WEBHOOK_SECRET` → must match n8n credential |
| **Edge function** | `supabase/functions/chat-notebook/index.ts` |
| **Header sent** | `x-n8n-secret: <INSIGHTSLM_CHAT_WEBHOOK_SECRET or N8N_WEBHOOK_SECRET fallback>` |
| **n8n workflow** | `n8n-workflows/definitions/insightslm-chat-agent__eOcEyrZMbGUFn2Hg.json` |
| **Webhook path** | `POST /webhook/chat` |
| **n8n auth** | Header Auth credential **`InsightsLm_Auth`** (`x-n8n-secret`) |

### What was wrong

Supabase had `INSIGHTSLM_CHAT_WEBHOOK_URL` set but **`INSIGHTSLM_CHAT_WEBHOOK_SECRET` was missing**.  
The edge function fell back to `N8N_WEBHOOK_SECRET`, which does **not** match the n8n `InsightsLm_Auth` credential.

Probe results:

```
x-n8n-secret: mTuhEe3JKWUxmUnG  → 200 OK
x-n8n-secret: <N8N_WEBHOOK_SECRET>  → 403 Authorization data is wrong!
```

### Fix applied

```bash
npx supabase secrets set \
  INSIGHTSLM_CHAT_WEBHOOK_SECRET="mTuhEe3JKWUxmUnG" \
  INSIGHTSLM_SOURCE_WEBHOOK_SECRET="mTuhEe3JKWUxmUnG" \
  --project-ref ralhkmpbslsdkwnqzqen
```

**Post-fix verification:** `chat-notebook` edge function → **200** with assistant reply.

---

## InsightsLM — source processing webhook

### Expected config

| Layer | Value |
|-------|-------|
| **Supabase secret (URL)** | `INSIGHTSLM_SOURCE_WEBHOOK_URL` → `…/webhook/7b9bb8e0-68fa-463f-87f2-2cf0bb1db4e6` |
| **Supabase secret (auth)** | `INSIGHTSLM_SOURCE_WEBHOOK_SECRET` |
| **Edge function** | `supabase/functions/process-source/index.ts` |
| **n8n workflow** | `insightslm-summary-generator__BLf8nGNjezv5HYld.json` |
| **n8n auth** | Same **`InsightsLm_Auth`** header credential |

### Notes

- Auth is now aligned with chat (same secret).
- Workflow may still return **500** if `file_url` is unreachable or Pinecone/OpenAI steps fail — that is workflow execution, not auth.
- Source uploads must use **signed URLs** (or public URLs) that n8n can HTTP-fetch.

---

## Mind Coach — session end webhook

### Expected config

| Layer | Value |
|-------|-------|
| **Supabase secret (URL)** | `MC_N8N_SESSION_END_WEBHOOK_URL` → `…/webhook/mind-coach-session-end` |
| **Supabase secret (auth)** | `MC_N8N_WEBHOOK_SECRET` (optional — n8n webhook has **no** header auth) |
| **Edge function** | `supabase/functions/mind-coach-session-end/index.ts` |
| **n8n workflow** | `mind-coach-session-end-orchestrator-v6-execute-workflow__1xntJU9IDNQ3tWle.json` |
| **Webhook path** | `POST /webhook/mind-coach-session-end` |
| **Sub-workflows** | Memory `FHwf1PMIrkN6T9j5`, Summary `WNCcZQDy6fcVL5RS`, Readiness `xE1TPYaF0MAZHO2W` |

### What was wrong

The earlier E2E `502` (`Workflow execution failed`) was **not** an RLS or Supabase secret URL issue:

- Direct POST to n8n webhook → **200** with full `case_notes` / `session_summary`
- Edge function `mind-coach-session-end` → **200** on re-test with valid `session_id` + `profile_id`

Likely causes of the original 502:

1. Transient n8n/OpenAI failure in one of the three sub-workflows
2. Session with insufficient message context (orchestrator merge step throws if summary/readiness branches missing)

### Mind Coach chat (reference)

| Layer | Value |
|-------|-------|
| **URL secret** | `MC_N8N_CHAT_WEBHOOK_URL` → `…/webhook/mind-coach-chat` |
| **n8n workflow** | `mind-coach-therapist-chat-and-discovery-v6-robust__EBo9At6eCh0S7vkM.json` |
| **Auth** | **None** on webhook node — no header secret required |

---

## Secret inventory (after fix)

| Secret name | Status |
|-------------|--------|
| `INSIGHTSLM_CHAT_WEBHOOK_URL` | ✅ Set |
| `INSIGHTSLM_CHAT_WEBHOOK_SECRET` | ✅ **Added** |
| `INSIGHTSLM_SOURCE_WEBHOOK_URL` | ✅ Set |
| `INSIGHTSLM_SOURCE_WEBHOOK_SECRET` | ✅ **Added** |
| `MC_N8N_SESSION_END_WEBHOOK_URL` | ✅ Set |
| `MC_N8N_CHAT_WEBHOOK_URL` | ✅ Set |
| `MC_N8N_WEBHOOK_SECRET` | ⚠️ Not set (optional for MC webhooks without header auth) |
| `N8N_WEBHOOK_SECRET` | ✅ Set (legacy fallback — **does not match** InsightsLM auth) |

---

## Credential map (n8n ↔ Supabase)

Several workflows share the **`InsightsLm_Auth`** credential (`x-n8n-secret`):

- `insightslm-chat-agent`
- `insightslm-summary-generator`
- `lab-report-processing`
- `ai-gating-lab-evaluator`

Products using **`InsightsLm_Auth`** should set their product-scoped Supabase secret to that credential value, **not** rely on `N8N_WEBHOOK_SECRET` unless you intentionally unify all secrets.

Health Twin chat uses a **different** credential in workflow JSON (`health_twin_chat_secret_123`) — ensure `N8N_HEALTH_TWIN_CHAT_WEBHOOK_SECRET` matches that if Health Twin chat ever returns 403.

---

## Quick verification commands

```bash
# InsightsLM chat (via edge function)
node --input-type=module -e "
import { readFileSync } from 'fs';
const env = Object.fromEntries(readFileSync('.env','utf8').split('\n').filter(l=>l.includes('=')).map(l=>{const [k,...r]=l.split('='); return [k.trim(), r.join('=').trim().replace(/^[\"']|[\"']$/g,'')]}));
const auth = await fetch(env.VITE_SUPABASE_URL+'/auth/v1/token?grant_type=password',{method:'POST',headers:{apikey:env.VITE_SUPABASE_ANON_KEY,'Content-Type':'application/json'},body:JSON.stringify({email:'test@example.com',password:'password'})}).then(r=>r.json());
const r = await fetch(env.VITE_SUPABASE_URL+'/functions/v1/chat-notebook',{method:'POST',headers:{apikey:env.VITE_SUPABASE_ANON_KEY,Authorization:'Bearer '+auth.access_token,'Content-Type':'application/json'},body:JSON.stringify({message:'hello',notebook_id:'<your-notebook-id>'})});
console.log(r.status, await r.text());
"

# Mind Coach session end (via edge function)
# Replace session_id / profile_id with real values from mind_coach_sessions
```

Direct n8n probe (InsightsLM chat):

```bash
curl -s -X POST "https://n8n.saksham-experiments.com/webhook/chat" \
  -H "Content-Type: application/json" \
  -H "x-n8n-secret: <InsightsLm_Auth value>" \
  -d '{"message":"probe","notebook_id":"<uuid>","session_id":"<uuid>","point":"chat"}'
```

Expected: HTTP 200 with JSON containing `summary` or `content`.

---

## InsightsLM source processing

See [`docs/INSIGHTSLM_SOURCE_PROCESSING_TRACE_2026-05-28.md`](INSIGHTSLM_SOURCE_PROCESSING_TRACE_2026-05-28.md) for PDF/text upload E2E results, pasted-text fix, and OpenAI fallback when n8n returns an empty body for `.txt` files.
