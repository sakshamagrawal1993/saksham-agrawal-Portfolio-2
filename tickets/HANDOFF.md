# LibertyMD — Handoff Package

**Date:** 2026-07-30
**Purpose:** everything a new agent needs to run the delivery loop and continue Phase 0/1 execution.
**Read `ONBOARDING-PROMPT.md` first** — it is the paste-ready brief. This file is the map.

---

## 0. Two locations, and why

| Location | Contains | Under git? |
|---|---|---|
| `~/Documents/Startups/Startups/LibertyMD/` | Planning artefacts, research, ticket specs | No |
| `~/Documents/Projects/saksham-agrawal-Portfolio-2/` | Code, `loop/`, `tickets/`, `docs/` | **Yes** |

**`tickets/` was copied into the repo and committed** because the loop runs stages inside git worktrees, and a worktree materialises only *tracked* files. The copies in `Startups/` are now historical. **Treat the repo copy as live.**

⚠️ **Two `tickets/` directories exist. Do not edit the `Startups/` one.**

---

## 1. Reading order — 6 files, ~40 minutes

Do not read everything. In this order:

| # | File | Why | Size |
|---|---|---|---|
| 1 | `tickets/CONTEXT.md` | Product, phase goal, 5 hard architectural rules **and why each exists**, principles, conventions, traps. Every loop stage loads this. | 7 KB |
| 2 | `tickets/DECISIONS.md` | Business-owner decisions. **Highest authority — overrides the PRD.** 9 entries. | 5 KB |
| 3 | `tickets/BASELINE.md` | Known pre-existing failures with counts. Without this you will fail tickets for sins they did not commit. | 7 KB |
| 4 | `tickets/COMPLETENESS-REPORT.md` | **Where execution actually stands.** 32 PASS / 20 FAIL / 11 UNTESTABLE. Start here for "what next". | 15 KB |
| 5 | `docs/product/PRD.md` | Product intent and required user behaviour. Authoritative for behaviour, not for everything. | 8 KB |
| 6 | `loop/RUNBOOK.md` | How to run the loop. | 4 KB |

Everything below is reference — read on demand, not upfront.

---

## 2. The artefact set, by role

### 2.1 Authority chain — memorise this

```
1. tickets/DECISIONS.md          ← highest; overrides everything
2. tickets/<ID>/03-clarified.md  ← the approved ticket contract
3. docs/product/PRD.md           ← product behaviour
4. docs/libertymd/CARE-ARCHITECTURE.md  ← live technical contract
5. repo conventions / tickets/CONTEXT.md
```

**If two authorities conflict, stop and escalate. Never silently pick a winner.**

### 2.2 Product & requirements

| File | Role | Caveat |
|---|---|---|
| `docs/product/PRD.md` | **The PRD the loop reads.** Written 2026-07-30, reflects all 9 decisions. | Authoritative |
| `docs/libertymd/LIBERTYMD-PRD.md` | Pre-existing repo PRD, 27 KB | ⚠️ **Predates the decisions. May conflict.** Reconcile or delete — do not treat as current |
| `LibertyMd_PRD_AI_Care_Product_and_Design_System.md` | Original aspiration PRD, 42 KB + design system | Historical. Useful for the design system (§9) and report layout (§8.6) only |

### 2.3 Technical specification

| File | Role |
|---|---|
| `docs/libertymd/CARE-ARCHITECTURE.md` | **The canonical live technical contract** — tables, proxy actions, n8n I/O. This is the "technical specification document". |
| `libertymd_flow_review_73be6742.plan.md` | **The Liberty flow** — per-flow data diagrams, which data lands in which table, n8n contracts, the state machine. 11 mermaid flows. |
| `LibertyMD_Product_Context_Current_State.md` | What exists today, schema-verified 2026-07-30 |
| `tickets/L0-5/04-implementation.md` | The proxy decomposition: 1508 → 90 lines, 22 modules. **Read before touching the proxy.** |
| `docs/libertymd/IMPLEMENTATION-ASSURANCE-STATUS.md` | Launch-readiness gates |
| `docs/libertymd/N8N-HOST-RETENTION-RUNBOOK.md` | n8n retention posture |

### 2.4 Tickets & acceptance criteria

| File | Role |
|---|---|
| `LibertyMD_Ticket_Specs_Phase0_Phase1.md` | **All 87 tickets with numbered ACs**, 110 KB. The spec source. Phase 0 (30), Phase 1 (25), Phase 2 (14), Phase 3 (8), Phase 4 (10) |
| `LibertyMD_Master_Register.md` | The 68-item gap register + **full Mixpanel event taxonomy** |
| `tickets/LANES.md` | 6-lane parallel plan, file manifests, merge order, contact points |
| `tickets/P0-14c/01-story.md` | Example of a good PM story (16 testable ACs) — use as the quality bar |

### 2.5 QA

| File | Role |
|---|---|
| `tickets/QA-batch-01/05-qa-report.md` | **The QA report**, 65 KB, 63 criteria, per-ticket tables with method + observed + verdict, 11 numbered defects |
| `tickets/COMPLETENESS-REPORT.md` | Digest of the above + status of all 62 Phase 0/1 tickets |

### 2.6 Strategy & research — reference only

`LibertyMD_Next_Phase_Plan.md` (strategy + hypotheses) · `LibertyMD_vs_Doctronic_Competitive_Analysis.md` · `LibertyMD_Customer_Journey_Redesign.md` (9 journey gaps) · `LibertyMD_Experience_Quality_Plan.md` · `LibertyMD_Phase_Spec_Review.md` · 4 Doctronic research files.

### 2.7 The loop itself

```
loop/loop.sh              orchestrator: doctor · run · plan · parallel · merge · resume · status
loop/setup.sh             one-time setup, no pasting required
loop/RUNBOOK.md           step-by-step
loop/prompts/pm.md        Claude — writes the story
loop/prompts/tech-refine.md  Codex — challenges it, no code
loop/prompts/pm-enrich.md    Claude — answers, escalates to you
loop/prompts/tech-build.md   Codex — implements
loop/prompts/qa.md           Cursor — verifies by execution
```

---

## 3. State of play

**All six gates pass** · TS **103** (baseline) · `falseNegative` **0** · corpus **22** scenarios.

| | Complete | Partial | Failed | Not started |
|---|---:|---:|---:|---:|
| Lane 0 | **7** | 0 | 0 | 0 |
| Phase 0 | 11 | 10 | 2 | 7 |
| Phase 1 | 0 | 0 | 0 | **25** |

**No ticket in the landed batch meets its own acceptance criteria.** The dominant defect is **half-shipped tickets** — correct server changes whose client half is missing.

### The 6 defects to fix first, in order

1. **Defect 1 (BLOCKING, safety)** — `submitDemographics` in `LibertyMDChat.tsx` *and* `LibertyMDApp.tsx` never reads `data.emergency`. A `force_end` renders as an interview question. **Also blocks P1-01.**
2. **Defect 3 (BLOCKING)** — `components/LibertyMD/libertymd-severity.ts` is imported by nothing but its test. Wiring it closes P0-14f, P0-16 and P0-14e AC3 together.
3. **Defect 4** — `mapMessages` promotes *any* `message_type === 'safety'` row to emergency chrome, including `clinical_review_needed` and the turn-cap close.
4. **Defect 2 (BLOCKING, safety)** — `acknowledgement()` appends a clinical sentence on transport failure, writing a clinical caution into the clinical record for a network error.
5. **Defect 5** — `tests/libertymd/n8n-breaker.mts` (17 tests) is wired to no gate **and cannot parse** (`**/*.ts` inside a block comment).
6. **Defect 6** — the viewport cluster is applied to `/liberty-md/chat` only; `LibertyMDApp` is also a live consult route.

---

## 4. Verification — the bar for every ticket

```bash
cd ~/Documents/Projects/saksham-agrawal-Portfolio-2
export PATH="/tmp/deno/bin:$PATH"
npm run test:libertymd:contracts
npm run test:libertymd:separability
npm run test:libertymd:policy
npm run test:libertymd:recovery
npm run test:libertymd:simulations
npm run test:libertymd:evaluation
npm run build
npx tsc --noEmit -p tsconfig.json 2>&1 | grep -c "error TS"
```

Run each individually — the chained `:ci` script can exceed a 200s timeout.

**Non-negotiable:** `falseNegative` stays **0** · TS ≤ **103** (per-file for files you touch) · `engineeringRegressionPassed: true`.

**`falseNegative` is the emergency-detection safety number.** If a change raises it, revert. There is no acceptable trade.

---

## 5. Environment facts that have already cost time

- **Supabase project:** `ralhkmpbslsdkwnqzqen`
- **bash is 3.2.57** on this Mac — no empty-array expansion under `set -u`
- **`timeout` does not exist on macOS.** `brew install coreutils` provides `gtimeout`. Without it every timeout in `loop.sh` is inert
- **`deno` is required** for `:policy` and `:evaluation`
- `LibertyMDChat.tsx` carries **8** pre-existing TS errors, `LibertyMDApp.tsx` **21**. The bar is *no new* errors
- **Two live products share the DB:** `libertymd-care-proxy` and `ai-care-proxy`. Check which a bug concerns before fixing
- **All three n8n workflows now run OpenAI `gpt-5.6-luna`** (migrated from Gemini 2026-07-30). Node type changed, so `modelName` became `model.value`
- **Two deterministic emergency screens exist** — the edge function's `clinical-policy.ts` (narrow) and the n8n guardrail's `Deterministic Prefilter` (5 presentations, negation-aware). **They have drifted.** P0-14a closes it

---

## 6. Open decisions for the business owner

| # | Question |
|---|---|
| 1 | Was the Gemini → OpenAI migration on the clinical guardrail intentional? Detection is unaffected (sens/spec 1.0) but it is a decision, not drift |
| 2 | Which stack do n8n executions 7447 / 7444 / 7441 belong to? Never had n8n access to read them |
| 3 | What does pulse.jivi.ai actually measure? Gates whether P3-04's accuracy claims are publishable |
| 4 | When does the `auth.users` split happen? Hive-off cost scales with user count — cheap at 18 profiles |
| 5 | Reconcile or delete `docs/libertymd/LIBERTYMD-PRD.md`, which predates the decisions |
