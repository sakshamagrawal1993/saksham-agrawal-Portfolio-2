---
name: ticket-cycle
description: >-
  Runs tickets through PM → Tech → QA using independent subagents. Two modes:
  Single (one ticket, five phases) and Parallel (many tickets across conflict-free
  lanes with worktree isolation and staged merge). Use when the user asks to run
  a ticket cycle, ticket-cycle, PM→Tech→QA, lane planning, parallel tickets,
  ./loop/loop.sh run, or names a ticket ID like P0-14a / P1-01 with delivery-loop
  intent. Prefer Single if unsure.
---

# Ticket Cycle

Runs tickets through PM → Tech → QA using independent subagents. Two modes:

- **Single** — one ticket, five phases. Start here if unsure.
- **Parallel** — many tickets across conflict-free lanes with worktree isolation and a staged merge. Use when the user asks for parallel execution or names a lane count.

If the repo has `loop/loop.sh`, **do not invoke it**. Orchestrate every phase yourself via **Cursor Task subagents only** — never Claude CLI, Codex CLI, `cursor-agent` CLI, or `./loop/loop.sh`. The skill is the protocol; Cursor Task is the only runtime.

## Isolation vs ignorance — read this before changing anything

Subagents start cold. That is a constraint to manage, not a feature to celebrate.

Isolate only what causes anchoring. Share everything else.

The one thing that anchors QA is the implementer's reasoning about this ticket — "here's how I think it works, here's why it's correct". If QA reads that, it stops testing and starts agreeing. So QA never sees `04-implementation.md`.

Everything else, every role gets:

| Context | PM | Tech | QA | Why |
|---|---|---|---|---|
| CONTEXT.md — product, architecture rules, principles, conventions | ✅ | ✅ | ✅ | A PM who doesn't know the product writes vague criteria. A Tech who doesn't know the rules breaks them. A QA who doesn't know what matters cannot recognise a regression. |
| DECISIONS.md | ✅ | ✅ | ✅ | Stops re-litigating settled questions |
| BASELINE.md | ✅ | ✅ | ✅ | Distinguishes pre-existing failures from new ones |
| 00-preflight.md | ✅ | ✅ | ✅ | What verification already exists |
| 01-story.md, 03-clarified.md | ✅ | ✅ | ✅ | The spec is the shared contract |
| 02-questions.md | ✅ | ✅ | ➖ | Tech's own investigation notes — reading them back saves re-deriving |
| 04-implementation.md | ➖ | ✅ | ❌ never | The only genuine isolation in the design |

**Corollary on trust:** the context pack is durable facts. Per-ticket analysis in specs and registers is an input to verify, never a finding to repeat. If a spec asserts a number, re-run the query. Specs go stale, and a subagent that parrots a stale spec is worse than one that checks.

## Artifacts

Per ticket, in `<root>/tickets/<TICKET-ID>/`:

```
00-preflight.md   which gates exist and which can actually run
01-story.md       PM: the story
02-questions.md   Tech: clarifying questions (no implementation yet)
03-clarified.md   PM: answers + enriched story; unresolved marked ESCALATE
04-implementation.md  Tech: what changed and why   ← QA must never read this
05-qa-report.md   QA: per-AC verdict + standing gates + manifest check
diff.patch        the change under test
```

Shared, at the tickets root:

- `CONTEXT.md` — product, phase goal, hard architectural rules and why, principles that shape criteria, conventions, source-of-truth paths, known traps. Create this before the first run. Without it every phase re-derives the product from scratch and gets it slightly wrong each time.
- `DECISIONS.md` — business-owner answers, appended never rewritten.
- `BASELINE.md` — known pre-existing failures with counts.
- `LANES.md` — parallel mode only. The lane manifest.

## Cursor orchestration

Use the **Task** tool. There are no dedicated `ticket-pm` / `ticket-tech` / `ticket-qa` subagent types — map roles as follows:

| Role | `subagent_type` | Notes |
|---|---|---|
| PM | `generalPurpose` | description like `PM story P0-14a` |
| Tech refine / build | `generalPurpose` | description like `Tech refine P0-14a` / `Tech build P0-14a` |
| QA | `generalPurpose` | description like `QA verify P0-14a` — **omit any path or excerpt of `04-implementation.md` from the prompt** |
| Parallel lane / worktree | `best-of-n-runner` or Shell `git worktree` | one active agent per lane |

Every Task prompt must include the **full context-load instruction** for that role (see [phases-single.md](phases-single.md)). Do not abbreviate it. Pass absolute paths to the ticket directory and shared context files.

Escalations: ask the business owner **as soon as they appear** (batched max 4 per ticket, recommended option first). Do **not** pause the whole run or defer questions to the end report. Only the ticket that escalated parks; other lanes / tickets keep executing. When the answer arrives, append to `DECISIONS.md` with date and ticket id, patch `03-clarified.md`, and resume that ticket.

## Workflow

1. Resolve `<root>` (repo containing `tickets/`).
2. Run **Phase 0 — Preflight** (orchestrator, no subagent). Details: [phases-single.md](phases-single.md).
3. Choose mode:
   - **Single** → follow [phases-single.md](phases-single.md) Phases 1–5 + Loop.
   - **Parallel** → plan lanes in [phases-parallel.md](phases-parallel.md), present `LANES.md`, wait for user confirmation, then execute.
4. Report at the end only: lanes, tickets completed and parked, escalations, loop counts, merge order, final gate state, artifact paths. **Do not narrate phases as they happen.**

## Rules

- Never let QA see `04-implementation.md`. Everything else is shared.
- One ticket per cycle. Batching within a lane defeats the audit trail.
- Every phase writes its artifact before the next begins; a crashed run resumes from the last artifact on disk.
- Append to `DECISIONS.md`, never rewrite. Update `BASELINE.md` only deliberately — never to silence a new failure.
- Keep `CONTEXT.md` current. It is the highest-leverage file in the system: every phase of every ticket reads it, so an error there propagates everywhere.

## When not to use this

A typo or one-line copy change does not need five phases. Use it where the spec could be wrong, the implementation is non-obvious, or the acceptance criteria carry real risk.

## Additional resources

- [phases-single.md](phases-single.md) — Preflight + Single-ticket phases 1–5, Loop, expert-review flag
- [phases-parallel.md](phases-parallel.md) — Lane planning, execution, merge protocol
