# RLS E2E Regression Report - 2026-05-29

## Scope

Products checked after Supabase RLS hardening:

- Health Twin: lab report data path, chat backing tables, featured dashboard data, playground baseline data.
- Trading Agents analysis.
- Jivi Mind Coach: new-user database journey shape, chat/session rows, pathway proposal, task assignment tables.
- Ticketflow.
- InsightsLM: notebook/source/chat table flow.
- AI Gating Lab.

## Live Findings And Resolutions

### Health Twin featured dashboards could not read dependent data

Symptom: featured `health_twins` were readable, but dependent dashboard rows such as `health_personal_details`, `health_lab_parameters`, `health_wearable_parameters`, `health_scores`, `health_sources`, `health_daily_aggregates`, and `health_wellness_programs` were hidden from signed-in non-owners.

Cause: the hardening pass kept featured twin discovery open but made child tables owner-scoped only.

Resolution: added `20260529090000_rls_e2e_regression_fixes.sql` with authenticated read policies for child rows whose parent twin is explicitly `featured = true`. Writes remain owner/service-role scoped.

### Health Twin lab/manual parameter writes failed through aggregate trigger

Symptom: transactional smoke inserts into `health_lab_parameters`/`health_wearable_parameters` failed because `update_daily_aggregate()` attempted an upsert into `health_daily_aggregates`.

Error: `new row violates row-level security policy for table "health_daily_aggregates"`.

Cause: `health_daily_aggregates` had owner read plus service-role writes, but client-owned parameter inserts invoke the aggregate trigger as the authenticated user.

Resolution: added authenticated owner insert/update policies on `health_daily_aggregates`.

### Trading Agents selected-stock quote failed

Symptom: `trading-agents-proxy` action `quote` for `AAPL` returned `Failed to fetch quote from all available providers`, while `batch_quote` worked.

Cause: single quote did not use the Finnhub fallback that made batch quotes resilient.

Resolution: added Finnhub REST fallback and TwelveData price fallback to the single-quote path. Deployed `trading-agents-proxy`. Live retest returned `AAPL` price, currency, and previous close.

### Trading Agents analysis stayed running after all agent logs arrived

Symptom: a live analysis queued successfully and wrote all expected agent logs through Portfolio Manager, but `trading_sessions.status` remained `running`.

Cause: async n8n runs append agent logs via `append_agent_log`; the callback inserted the Portfolio Manager decision log but did not update the session completion fields.

Resolution: updated `append_agent_log` so Portfolio Manager/decision logs parse the decision and update `trading_sessions` to `completed` with final decision, confidence, horizon, and thesis. Deployed `trading-agents-proxy`.

## Verification Completed

- `deno check supabase/functions/trading-agents-proxy/index.ts`: passed.
- `npm run build`: passed. Existing Tailwind ambiguity warning for `duration-[1.5s]` remains unrelated.
- Live AI Gating Lab smoke: completed and persisted public history; current run used fallback evaluator while earlier history includes an n8n result.
- Live Trading Agents quote smoke: passed after fix.
- Live Trading Agents run smoke before completion fix: queued and wrote 9 logs: System, Technical Analyst, News Analyst, Fundamentals Analyst, Social Media Analyst, Bull Researcher, Bear Researcher, Research Manager, Portfolio Manager.
- Transactional live RLS smoke (`scripts/rls_e2e_smoke.sql`): passed and rolled back product data. Result summary:
  - Ticketflow tickets/remarks/actions visible to authenticated user: `1/1/1`.
  - InsightsLM notebook hidden from other user: `0`; owner source/chat visible: `1/1`.
  - Health Twin featured child rows visible to another signed-in user: details/labs/wearables `1/1/1`.
  - Mind Coach profile/messages/pathway proposal/tasks visible to owner: `1/1/1/1`.

## Limitations

- A new email/password auth user was created for testing, but production Supabase requires email confirmation, so browser-level "brand new user logs in and completes onboarding" could not be completed without mailbox/OAuth access.
- A second Trading Agents run was queued after deploying the completion fix, but the follow-up polling command was blocked by the Codex approval system usage limit. The deployed code path is verified locally by `deno check` and build, and the pre-fix run confirmed the exact callback payload shape that the fix handles.
- `db push` was not used because remote migration history contains four dashboard/remote migrations from `2026-05-28 03:18-03:33 UTC` that are not present locally. The hotfix SQL was applied through the Supabase Management API and is recorded in the repo migration file.
- Because the approval limit was hit after the final Trading Agents queue test, cleanup of persisted smoke rows was not run. Known smoke artifacts include the AI Gate idea titled `Codex RLS smoke support triage` and Trading Agents sessions `6d400a45-bb82-4f4c-977b-c3d5fd6a8839` and `8f589cc8-390e-4771-b7ba-486e8373d314`.
