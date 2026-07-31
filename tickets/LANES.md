# LANES.md — Parallel execution plan, Phase 0 + Phase 1

**Date:** 2026-07-30
**Target concurrency:** 6 lanes
**Scope:** 55 tickets (P0 ×30, P1 ×25), minus 4 already implemented
**Method:** lanes assigned by **file collision**, not by theme. Themes are what fell out, not what drove it.

Review this before executing. Lane planning is cheap; a bad split is not.

---

## Lane 0 — Prerequisites. Sequential, alone, to completion.

**Nothing parallel starts until this lane is green.** Two of these items are the difference between six real lanes and six lanes fighting over one file.

| # | Task | Size | Why it blocks everything |
|---|---|---:|---|
| **L0-1** | Pass `--definitions-dir=` in the `test:libertymd:contracts` npm script | XS | Today it runs without the flag → `workflowsChecked: 0` → exits 0 having validated **nothing**. In parallel that means six lanes all verified against a dead gate. |
| **L0-2** | Fix the stale `correctModel` assertion | XS | With the flag passed, all three workflows FAIL: validator asserts `models/gemini-3.1-flash-lite`, workflows use `3.5`. Pre-existing (fails on backups too) and a **stale assertion, not a defect** — workflows are on a newer model. Make it a version floor. |
| **L0-3** | Install `deno` wherever CI runs | XS | `test:libertymd:policy` and `:evaluation` cannot execute without it. Two of five gates are currently unrunnable. |
| **L0-4** | Write `tickets/BASELINE.md` | S | Record the ~8 pre-existing `LibertyMDChat.tsx` TS errors and the post-L0-2 gate state. Without it every lane's QA either fails tickets for sins they didn't commit, or learns to ignore failures. |
| **L0-5** | **Decompose `libertymd-care-proxy/index.ts`** | M | **The parallelism enabler.** 1508 lines, 13 action handlers in one dispatch chain, touched by 5 of 6 lanes. Split it now or every lane conflicts on it for the whole run. |
| L0-6 | P0-01, P0-03 — stack attribution + stale-doc correction | XS | Cheap, and P0-01 determines whether Lane C's n8n work is even LibertyMD's problem. |
| L0-7 | P0-02a — separability CI check | S | Asserts zero cross-product FKs stay zero. Independent of everything. |

### L0-5 target structure

Pure refactor. No behaviour change. Verified by the existing suite passing identically before and after.

```
libertymd-care-proxy/
  index.ts              dispatch only (~120 lines)
  actions/
    bootstrap.ts  start-consultation.ts  save-demographics.ts
    send-message.ts  abandon-resume.ts  report.ts  identity.ts  reads.ts
  lib/
    safety.ts       guardrail handling + saveSafetyEvent   → Lane B owns
    slots.ts        slot merge / missing computation        → Lane A owns
    telemetry.ts    emitEvent fan-out                      → Lane E owns
    errors.ts       failure taxonomy + responses           → Lane C owns
    n8n-client.ts   timeouts, retries, breaker             → Lane C owns
  clinical-policy.ts    (exists, 147 lines)                → Lane B owns
```

Each lane then owns distinct modules instead of contending for one file. **This is the single highest-leverage item in the plan.**

---

## The six lanes

Tickets run **sequentially within** a lane, lanes run **concurrently**. Order within each lane is dependency-first, then smallest-first so early wins land.

### Lane A — Interview & slots
**Owns:** `libertymd-interview-workflow.json` *(atomic — whole file is one unit)*, `lib/slots.ts`, `actions/send-message.ts`

| Order | Ticket | Note |
|---|---|---|
| 1 | P0-06 | target_slot guard. P0-04/P0-05 already implemented 2026-07-30 |
| 2 | P1-14 | comprehension check |

### Lane B — Safety detection
**Owns:** `libertymd-guardrail-workflow.json` *(atomic)*, `clinical-policy.ts`, `lib/safety.ts`

| Order | Ticket | Note |
|---|---|---|
| 1 | P0-14c | raw_result logging. Story already written; **do 14c before 14b** — the current audit workaround joins to `messages` and only works while each firing consult has one user message |
| 2 | P0-14a | edge↔n8n pattern parity. **The n8n side already has 5 presentations + negation; the edge screen has 1.** This is porting, not authoring |
| 3 | P0-14b | evaluate every turn |
| 4 | P0-15a | shadow-mode the LLM guardrail |
| 5 | P0-17 | condition-specific emergency copy |

### Lane C — Reliability & error handling
**Owns:** `lib/errors.ts`, `lib/n8n-client.ts`, `AICareChat.tsx` sendMessage, `LibertyMDChat.tsx` **sendMessage only**

| Order | Ticket | Note |
|---|---|---|
| 1 | P0-07 | n8n reachability. **Needs n8n access — may park.** P0-09/P0-10 already implemented |
| 2 | P0-08 | failing workflows (7447/7444/7441) |
| 3 | P0-11 | timeout budgets + circuit breaker |
| 4 | P0-12 | failure taxonomy → copy |
| 5 | P0-13 | hard invariants in the proxy |

### Lane D — Viewport & chat UI
**Owns:** `LibertyMDChat.tsx` **render tree only**, chat presentation components

| Order | Ticket | Note |
|---|---|---|
| 1 | P0-18 | pin emergency to viewport — **safety-grade, do first** |
| 2 | P0-19 | scroll-anchor after layout |
| 3 | P0-20 | new-message jump pill |
| 4 | P0-23 | scroll padding |
| 5 | P0-16 | four-severity mapping *(enum source is Lane B — see contact points)* |
| 6 | P0-21 | fixed bottom action bar |
| 7 | P0-22 | bottom sheet as overlay |
| 8 | P0-24 | mobile viewport correctness |
| 9 | P1-11 | chip styling |
| 10 | P1-07 | staged waiting states |
| 11 | P1-13 | resume prompt copy |

### Lane E — Instrumentation & data
**Owns:** `lib/telemetry.ts`, migrations, client analytics module, cleanup jobs

| Order | Ticket | Note |
|---|---|---|
| 1 | P1-15 | extend `product_events` allow list |
| 2 | P1-16 | Mixpanel server pipeline |
| 3 | P1-17 | client SDK + identity resolution |
| 4 | P1-18 | **mask Session Replay** — it is currently ON and will capture symptom text |
| 5 | P1-19 | `landing_sessions` table |
| 6 | P1-20 | `turn_facts` view |
| 7 | P1-21 | generated columns |
| 8 | P1-23 | schedule cleanup cron |
| 9 | P1-24 | extend cleanup to Storage — **blocks all Phase 4 upload work** |
| 10 | P1-22 | funnel dashboard |

### Lane F — Entry & profiles
**Owns:** `actions/start-consultation.ts`, `actions/save-demographics.ts`, `actions/identity.ts`, entry + profile components

| Order | Ticket | Note |
|---|---|---|
| 1 | P1-05 | adults-only enforcement |
| 2 | P1-04 | anonymous = single self profile |
| 3 | P1-03 | profile-aware demographics skip |
| 4 | P1-01 | **unified entry screen — the 35% wall, highest funnel value in the plan** |
| 5 | P1-02 | time promise |
| 6 | P1-06 | progress indicator |
| 7 | P1-10 | warm off-topic recovery |
| 8 | P1-09 | partial outcome on abandon |
| 9 | P1-12 | draft persistence |
| 10 | P1-25 | merge-modal interruption audit |

**Excluded from the graph:** `DECISIONS.md`, `BASELINE.md`, spec docs. Append-only — reconcile by hand at the end, or they collapse all six lanes into one component.

---

## Cross-lane contact points

Three places where symbol-level ownership is doing real work. Watch these at merge.

| Lanes | File | Split | Risk |
|---|---|---|---|
| **C ↔ D** | `LibertyMDChat.tsx` (1155 lines) | C owns `sendMessage` + catch; D owns the render tree | **Highest.** Same file, both lanes active throughout |
| **B → D** | severity enum → styling | B defines `status`/`risk_level`/`source`; D maps to four visual tiers (P0-16) | Sequence B's P0-17 before D's P0-16, or D codes against a stub |
| **A ↔ F** | `actions/send-message.ts` vs `save-demographics.ts` | Distinct post-L0-5 | Low, provided L0-5 lands first |

---

## Merge order

**Highest-collision lane first**, so the others rebase onto it rather than it rebasing onto everything.

```
Lane 0  →  D  →  C  →  F  →  A  →  B  →  E
```

- **D first** — owns the most contested file (`LibertyMDChat.tsx`, shared with C and F).
- **C second** — rebases onto D within the same file while D's shape is fresh.
- **B late** — safety changes land against an already-verified base, and B's atomic workflow JSON conflicts with nobody.
- **E last** — most additive, fewest shared symbols.

**Run the full standing-gate set after every single merge, not once at the end.** Incremental gating is the only way to attribute a break to a lane. On a post-merge failure the last-merged lane is prime suspect: revert, confirm green, re-land with a fix rather than debugging a merged tree.

**After the final merge, re-run `npm run test:libertymd:ci` plus the 20-scenario corpus.** Per-lane green does not mean combined green — and in this codebase the failure mode that matters is two guardrail changes each passing alone while jointly breaking emergency detection.

---

## Realistic expectations

- **Lane C may park on P0-07.** Requires n8n execution access nobody has confirmed. Parking is fine — the other five continue.
- **Lane D is the longest** (11 tickets, mostly S/XS). It will finish last on ticket count even though it merges first.
- **Lane F carries the most product value** (P1-01 addresses 35% of all users, now confirmed real). If capacity forces a cut, cut Lane E's dashboard work before Lane F.
- **Lane B is the most dangerous.** Every ticket touches emergency detection. Its QA must run the corpus every time, not just at the end.
- **Six lanes is not six times faster.** Lane 0 is serial, merges are serial, and the contact points force sequencing. Expect roughly 3–3.5× throughput, not 6×.

---

*Produced by the `ticket-cycle` skill, Phase −1. Regenerate if the ticket set changes materially.*
