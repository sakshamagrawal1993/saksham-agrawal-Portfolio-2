# Phase 0→4 execution queue — 2026-07-31

**Concurrency:** 3 lanes. Hats sequential within a lane. Escalate BO questions at runtime; only the escalated ticket parks.

**Base commit:** `83b1188` (defect pack) + `a64049b` (P0-14a clarified).

## Completed this session

| ID | Status |
|---|---|
| Defects 1–6 | DONE — client emergency/severity/viewport + breaker gate |
| P0-14d / 14e / 14f / 16 / 18 | DONE (marked in ticket specs) |
| P0-11 | PARTIAL — breaker wired; client holding-state still open |
| P0-14a decisions | recorded in `DECISIONS.md` |

## Active now (3 agents)

| Lane | Ticket | Owner files |
|---|---|---|
| B | **P0-14a** | `clinical-policy` / emergency-patterns / n8n guardrail / schemas / corpus |
| C | **P0-13** AC5 | `tests/libertymd/proxy-invariants.mts` + save-demographics ownership |
| (queued) | **P0-17** | starts after P0-14a vocabulary lands |

## Phase 0 remaining (after active)

Order respects dependencies and file collision:

1. P0-14a → P0-14c → P0-14b → P0-15a
2. P0-11 client half (holding / parse 503 body) — Chat send path
3. P0-12 remainder (taxonomy / offline queue) — after P0-11 client
4. P0-17 (after 14a)
5. P0-18a → P0-18b (detect/act/show)
6. P0-21 → P0-22 → P0-24 (viewport cluster remainder)
7. P0-07 / P0-08 — **park until n8n execution access** (BO open Q2)

## Phase 1 (after Phase 0 safety path green)

P1-01 first (unified entry; AC0 emergency already closed by Defect 1) → P1-02…05 → interview P1-06…14 → instrumentation P1-15…25.

## Phase 2–4

Only after Phase 0 emergency + Phase 1 entry instrumentation are defensible. Follow register §12 one-thing-per-phase: P2-02+06 → P3-02 → P4-02.

## Worktree note

`.worktrees/P0-*` were corrupted during reset (sandbox). Current builds run on **main**. Recreate worktrees from HEAD when cleaning with full permissions.
