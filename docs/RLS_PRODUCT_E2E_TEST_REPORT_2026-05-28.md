# RLS Hardening — Product E2E Test Report

**Date:** 2026-05-28  
**Scope:** Post-RLS policy hardening validation across 6 portfolio products  
**Supabase project:** `ralhkmpbslsdkwnqzqen` (Ticket Flow)  
**Test runner:** `scripts/product_rls_e2e_test.mjs` (authenticated user `test@example.com`)

---

## Executive summary

After the RLS hardening migrations (`20260528040000`–`20260528044500`), most product database paths work correctly for authenticated users. **Three real regressions** were found and fixed:

1. **InsightsLM file re-upload (upsert)** — missing storage `UPDATE` policy  
2. **InsightsLM chat + source summary persistence** — deployed edge functions still called revoked RPC `get_or_create_chat_session`  
3. **Health Twin lab report processing** — n8n received public URLs after `health_documents` bucket was locked to owner-only reads  

**Ticketflow**, **Mind Coach** (DB CRUD), **AI Gating Lab**, **Health Twin chat/playground**, and **Trading Agents lessons** pass RLS checks. **Trading Agents live quote** and **InsightsLM/Mind Coach n8n webhooks** fail due to external provider/webhook configuration, not RLS.

---

## Test matrix

| Product | Flow | Result | Notes |
|---------|------|--------|-------|
| Health Twin | Twin CRUD, chat sessions/messages | ✅ Pass | Owner-scoped RLS works |
| Health Twin | Lab source insert | ✅ Pass | `health_sources` insert OK |
| Health Twin | Lab file → n8n | ⚠️ Fixed | Was broken via public URL; now uses signed URLs |
| Health Twin | Chat (`chat-completion`) | ✅ Pass | Edge fn uses service role |
| Health Twin | Playground (`generate-wellness-playground`) | ✅ Pass | No DB writes from client |
| Trading Agents | `lessons_context` | ✅ Pass | Edge fn + service role |
| Trading Agents | `quote` | ⚠️ External | 500 — all quote providers unavailable (not RLS) |
| Mind Coach | Profile / session / message CRUD | ✅ Pass | Owner-scoped policies OK |
| Mind Coach | Session start edge fn | ✅ Pass | |
| Mind Coach | Session end + pathway | ⚠️ Partial | RLS/DB OK; n8n session-end workflow returned 502 (external) |
| Mind Coach | Chat (n8n) | ⚠️ External | Depends on n8n webhook availability |
| Ticketflow | Ticket + remark CRUD | ✅ Pass | Requires authenticated user |
| InsightsLM | Notebook + source CRUD | ✅ Pass | |
| InsightsLM | Storage upload | ✅ Pass | Path must be `{user_id}/…` |
| InsightsLM | Storage upsert (re-upload) | ✅ Fixed | Was 403 RLS; added UPDATE policy |
| InsightsLM | Chat (`chat-notebook`) | ✅ Fixed (RLS) | Session init works; n8n may return 403 if webhook secret wrong |
| InsightsLM | Source processing summary save | ✅ Fixed | `process-source` redeployed without revoked RPC |
| AI Gating Lab | History read | ✅ Pass | SELECT-only client access (writes via edge fn) |
| AI Gating Lab | Evaluate (`ai-gating-evaluate`) | ✅ Pass | Service role persists assessments |

---

## Issues found and resolutions

### 1. InsightsLM storage upsert blocked (RLS)

**Symptom:** Re-uploading a file with `upsert: true` returned `403 Unauthorized — new row violates row-level security policy`.

**Root cause:** Storage hardening added INSERT/SELECT/DELETE for `InsightsLM` bucket but not **UPDATE**, which Postgres storage upsert requires.

**Resolution:** Migration `20260528190000_fix_storage_rls_gaps.sql` — policy `Users can update their own files` on `storage.objects` for bucket `InsightsLM`.

**Verification:** Second upload to same path returns `200` after migration.

---

### 2. InsightsLM chat failed — revoked RPC in deployed edge functions (RLS-adjacent)

**Symptom:** `chat-notebook` returned `400 {"error":"Failed to init chat session"}`.

**Root cause:** Deployed `chat-notebook` and `process-source` still called `get_or_create_chat_session(uuid, uuid)`, which was **revoked** from `authenticated` in `20260528041500_finalize_function_security.sql`. Local repo code had already been updated to use service-role direct inserts, but was **not deployed**.

**Resolution:**
- Redeployed `chat-notebook` — service role client, notebook ownership check, direct session create/update  
- Redeployed `process-source` — same pattern for summary persistence  
- Updated `NotebookLayout.tsx` — `fetchMessages` uses `.maybeSingle()` instead of `.single()` when multiple sessions exist  

**Verification:** Session init succeeds; function now reaches n8n (may fail with `n8n error: Forbidden` if webhook secret is misconfigured — separate from RLS).

---

### 3. Health Twin lab reports — n8n could not fetch files (RLS)

**Symptom:** After storage hardening, lab processing would fail because n8n received a **public URL** for `health_documents`, but the bucket now requires authenticated owner access.

**Root cause:** `LeftPanel.tsx` used `getPublicUrl()` after upload. Migration removed public read on `health_documents`.

**Resolution:**
- `LeftPanel.tsx` — create **signed URL** (1h) for processing and store/send that URL  
- `process-lab-report` — accept optional `storage_path` and re-sign server-side via service role before calling n8n  

**Verification:** Upload + signed URL generation works for PDF MIME types allowed by bucket config.

---

### 4. Non-issues / external failures (no code change required for RLS)

| Item | Detail |
|------|--------|
| Trading Agents `quote` 500 | Edge fn error: "Failed to fetch quote from all available providers" — upstream market data, not database RLS |
| InsightsLM / Mind Coach n8n 403/502 | Webhook secret or n8n workflow execution — edge functions pass RLS and reach n8n; session-end returned `Workflow execution failed` |
| Health Twin test with `text/plain` | Bucket `allowed_mime_types` excludes plain text; real PDF uploads are unaffected |
| AI Gate client writes | By design: only SELECT policies on `ai_gate_*` tables; inserts go through `ai-gating-evaluate` service role |

---

## RLS policy health check

- All public tables with RLS enabled have at least one policy (verified via SQL).  
- Supabase security advisor: only warning is **leaked password protection disabled** (Auth setting, unrelated to product flows).  
- Edge functions that mutate user data should use **`SUPABASE_SERVICE_ROLE_KEY`** and validate the caller JWT — pattern confirmed in updated functions.

---

## Files changed

| File | Change |
|------|--------|
| `supabase/migrations/20260528190000_fix_storage_rls_gaps.sql` | InsightsLM storage UPDATE policy |
| `supabase/functions/chat-notebook/index.ts` | Deployed (service role session management) |
| `supabase/functions/process-source/index.ts` | Deployed (service role summary persistence) |
| `supabase/functions/process-lab-report/index.ts` | Signed URL resolution for n8n |
| `components/HealthTwin/LeftPanel.tsx` | Signed URLs for lab uploads |
| `components/InsightsLM/Workspace/NotebookLayout.tsx` | Safer chat session fetch |
| `scripts/product_rls_e2e_test.mjs` | Repeatable E2E smoke test script |

---

## How to re-run tests

```bash
node scripts/product_rls_e2e_test.mjs --email test@example.com --password password
```

For Mind Coach long chat / session-end load testing:

```bash
python3 scripts/jivi_mindcoach_e2e_chat_runner.py --turns 5 --theme generic
```

---

## Recommended follow-ups

1. ~~**Rotate/verify n8n webhook secrets** for InsightsLM chat and source workflows~~ **Done (2026-05-28):** Set `INSIGHTSLM_CHAT_WEBHOOK_SECRET` and `INSIGHTSLM_SOURCE_WEBHOOK_SECRET` to match n8n credential `InsightsLm_Auth`. `chat-notebook` now returns 200.
2. **Trading Agents quote providers** — check Finnhub/VPS credentials in edge function secrets.
3. **Enable Supabase leaked password protection** in Auth settings (security advisor recommendation).
4. Consider adding `storage_path` column to `health_sources` so signed URLs are not stored in `file_url` (expires after 1h).

---

## Webhook config trace (2026-05-28 follow-up)

See also: [`docs/N8N_WEBHOOK_CONFIG_TRACE_2026-05-28.md`](N8N_WEBHOOK_CONFIG_TRACE_2026-05-28.md)
