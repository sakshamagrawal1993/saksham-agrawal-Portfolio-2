# BASELINE.md — known pre-existing state

**Measured:** 2026-07-30, after L0-1/L0-2. **Re-verified after P0-14d/14e, P0-14f/16, P0-11/13 and the viewport cluster** — all six gates green, TS 103, `falseNegative: 0`.

> ## ⚠️ The clinical model changed on 2026-07-30
>
> A deploy migrated **all three LibertyMD workflows from Google Gemini to OpenAI `gpt-5.6-luna`**, and the node type changed from `lmChatGoogleGemini` to `lmChatOpenAi`, so `parameters.modelName` became `parameters.model.value`.
>
> | | Before | After |
> |---|---|---|
> | Node type | `lmChatGoogleGemini` | `lmChatOpenAi` (typeVersion 1.3) |
> | Model | `models/gemini-3.5-flash-lite` | `gpt-5.6-luna` |
> | Workflows affected | — | guardrail, interview, diagnosis (5 LLM nodes total) |
>
> **This silently blinded the contract gate a second time** — the extractor read `modelName`, found nothing, and reported an empty model list. Fixed: the validator now reads every known node shape, asserts against an explicit `APPROVED_MODELS` allow-list, and **fails if an LLM node's model cannot be read at all**. A pattern stops matching when a schema moves; an allow-list plus a "found nothing" failure does not.
>
> **Needs your confirmation:** was the Gemini → OpenAI switch on the clinical inference path intentional? The corpus still passes at sensitivity 1.0 / specificity 1.0, so detection behaviour is intact — but a provider change on the guardrail is a decision, not a config drift, and it should be recorded in `DECISIONS.md` either way. Both models are currently in `APPROVED_MODELS` so a rollback also passes.
**Purpose:** lets QA distinguish **new** breakage from **pre-existing** breakage. Without this, QA either fails every ticket for sins it did not commit, or learns to ignore failures. Both are fatal.

**Rule:** only ever update this deliberately, when a failure is genuinely fixed or genuinely accepted. **Never update it to silence a new failure** — that is the one way this file becomes worse than useless.

---

## Gate state

All five gates in `npm run test:libertymd:ci` **run and pass**.

| Gate | Command | State | Notes |
|---|---|---|---|
| Contracts | `test:libertymd:contracts` | ✅ PASS | 3 schemas, 8 fixtures, 3 workflows, 20-scenario suite valid. **Fixed in L0-1** — previously validated 0 workflows |
| Policy | `test:libertymd:policy` | ✅ PASS | 15 tests. Requires deno |
| Recovery | `test:libertymd:recovery` | ✅ PASS | 5 tests. Requires deno |
| Simulations | `test:libertymd:simulations` | ✅ PASS | 10 loops |
| Evaluation | `test:libertymd:evaluation` | ✅ PASS (engineering) | See two-tier gate below |
| DB | `test:libertymd:db` | ⚠️ NOT RUN | Needs `supabase` CLI + local stack. Not part of `:ci` |
| Live smoke | `test:libertymd:live` | ⚠️ NOT RUN | Needs `.env` and live backend. Not part of `:ci` |

**Runtime requirement:** `deno` is needed for `:policy` and `:evaluation`. Confirmed working with deno 2.9.4. If it is absent those two gates cannot run — record `CANNOT RUN`, never skip silently.

## Clinical evaluation — expected two-tier result

`test:libertymd:evaluation` deliberately reports **two** verdicts. Both values below are **correct and expected**. Do not "fix" the second one.

**Updated 2026-07-30 after P0-14d** — the corpus gained 2 scenarios (14d AC4 mandated a demographics-turn emergency case). Counts moved legitimately; this is not a regression.

```
truePositive 9 · trueNegative 13 · falsePositive 0 · falseNegative 0
sensitivity 1.0 · specificity 1.0
engineeringRegressionPassed : true    ← this is the CI gate
clinicalReleaseGatePassed   : false   ← expected: no clinician has approved targets
pendingClinicalReview       : 22
clinicalTargetsApproved     : false
emergencySensitivityMinimum : null
emergencySpecificityMinimum : null
```

*Superseded: TP 8 · TN 12 · pendingClinicalReview 20 (initial Lane 0 measurement).*

**QA rule:** a ticket regresses this gate only if `engineeringRegressionPassed` flips to `false`, or if `falseNegative` rises above 0. `clinicalReleaseGatePassed: false` is the standing state until a clinician signs off the targets — it is not a defect and not a ticket.

**`falseNegative` is the number that matters.** It is currently 0 across all 8 emergency scenarios. Any change that raises it is a safety regression and blocks release regardless of every other result.

## TypeScript errors

**Repo-wide total: 103.** The bar is **no new errors**, not a clean typecheck.

Counted with `npx tsc --noEmit -p tsconfig.json`.

| File | Errors |
|---|---:|
| `components/LibertyMD/LibertyMDApp.tsx` | 21 |
| `tests/libertymd/clinical-policy.test.ts` | 16 |
| `scripts/libertymd-live-validation.ts` | 8 |
| `components/LibertyMD/LibertyMDChat.tsx` | 8 |
| `tests/libertymd/abandoned-chat-recovery.test.ts` | 6 |
| `scripts/libertymd-clinical-evaluation.ts` | 5 |
| `scripts/libertymd-flow-simulation.ts` | 4 |
| `components/LibertyMD/LibertyMDCareControls.tsx` | 4 |
| 8 other LibertyMD components | 1 each |
| `components/AICare/AICareObservations.tsx` | 1 |

**QA method:** run the count, compare the total and the per-file count for files the diff touches. A diff touching `LibertyMDChat.tsx` must leave it at **8 or fewer**.

**Note for Lanes C, D and F:** `LibertyMDApp.tsx` (21) and `LibertyMDChat.tsx` (8) carry the most pre-existing errors and are the most-touched files in the plan. Expect to compare per-file, not just the total.

## Known-dirty working tree

Files modified before Lane 0 began, unrelated to it. Not caused by any ticket:

- `definitions/ai-care-diagnosis-workflow__*.json`
- `definitions/ai-gating-lab-evaluator__*.json`
- `definitions/fno-copilot-sub-*.json` (6 files)

**Provenance unknown** — possibly work in progress. Confirm with the business owner before any lane commits, so unrelated changes are not swept into a ticket's diff.

## Changes already landed pre-Lane-0

Applied 2026-07-30 outside the ticket cycle. Backups in `n8n-workflows/definitions/.backup-20260730/`.

| Change | Ticket | Verified by |
|---|---|---|
| `missing_slots` recomputed authoritatively; `duration` merged into `onset`; `target_slot` guard | P0-04, P0-05 | Replayed consultation `defd21a5` |
| Guardrail negation checks all matches, stops at clause boundary; past-tense-only family-history suppression; tightened "sudden headache" | Part of P0-14a | 15/15 hand cases; 20/20 corpus, 0 false negatives |
| `alert()` removed, tiered retry, message retained, status→copy mapping | P0-09, P0-10 | Typecheck clean on `AICareChat.tsx` |
| Non-retryable 4xx no longer retried; status-specific copy | Part of P0-12 | — |

**Note:** these bypassed the PM → Tech → QA cycle. They were verified but not adversarially reviewed. Lanes A, B and C should treat them as **inherited work to confirm**, not as settled.

## Traps that will otherwise waste a lane's time

- `test:libertymd:contracts` **now hard-fails** if it cannot find the n8n definitions directory. Resolution order: `--definitions-dir=` flag → `LIBERTYMD_N8N_DEFINITIONS_DIR` env → `../n8n-workflows/definitions`.
- `deno` is not on the default PATH in every environment. Install before running `:ci`.
- There are **two** deterministic emergency screens (`clinical-policy.ts` in the edge function, and the n8n guardrail's `Deterministic Prefilter`). The n8n one has 5 presentations and negation handling; the edge one is narrower. **They have drifted** — P0-14a closes it.
- `libertymd-care-proxy` and `ai-care-proxy` are different products. Check which a bug concerns before fixing.
