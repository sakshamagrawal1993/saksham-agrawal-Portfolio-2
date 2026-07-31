# Single-ticket mode + Preflight

## Phase 0 — Preflight (orchestrator, no subagent)

Read `CONTEXT.md`, `DECISIONS.md`, `BASELINE.md`. If `CONTEXT.md` does not exist, write it first — ask the user for anything you cannot establish from the repo.

Discover the existing test surface. Check `package.json` scripts, `tests/`, `scripts/`, schema and fixture directories. Projects frequently already have a purpose-built harness that a cold agent will otherwise hand-roll badly.

Verify each gate can actually run here. Check the runtime exists. A gate you cannot execute is recorded `CANNOT RUN`, never silently skipped.

Check each gate actually checks something. A suite reporting 0 items checked and exiting 0 is worse than no suite: a green light wired to nothing. Confirm non-zero counts and required flags.

Write `00-preflight.md`: gates found, command, runnable, current pass/fail, anything that no-ops.

---

## Single-ticket mode

Every brief below begins with the same context load. Do not abbreviate it.

**Context (all roles):** read `CONTEXT.md`, `DECISIONS.md`, `BASELINE.md`, `00-preflight.md` before anything else. Honour every decision and architectural rule in them. Treat spec-document claims as inputs to verify, not findings to repeat.

### Phase 1 — PM writes the story

Spawn a subagent (ticket-pm if defined, else general-purpose). Context load, then:

You are the Product Manager. Write `01-story.md` for ticket `<ID>`. Include: intent (one line on why this matters for the product, grounded in the phase goal from `CONTEXT.md`), scope in/out, numbered testable acceptance criteria, DoD additions, dependencies, risks. In parallel mode also include the file manifest: every path this ticket may touch. Every AC must be checkable by running a command, query, or test. If you cannot express something testably, write it as an open question rather than a vague criterion. Prefer existing verification over inventing new tests — check `00-preflight.md` first. If an existing suite already covers part of this ticket, say so; the ticket may be partly redundant, and that is a valuable finding. Ground every claim by reading code and querying the database. Distinguish what you verified yourself from what you inherited. Modify nothing outside the story file.

### Phase 2 — Tech challenges it

Spawn a subagent (ticket-tech if defined, else general-purpose). Context load, then:

You are the Tech Lead. Read `01-story.md` and the codebase. Do not implement anything. Write `02-questions.md`: each ambiguity that would change your implementation, with (a) the question, (b) what you already checked with file:line or query output, (c) your default if nobody answers. Record your investigation properly — you will read this file again in Phase 4, and anything you leave out you will re-derive. Design-changing questions first. Do not ask what the repo, schema, specs, `CONTEXT.md` or `DECISIONS.md` already answer — a question the codebase answers is your failure, not the PM's. If a claim in the story is factually wrong, say so with evidence; worth more than a question. Flag any AC untestable as written, and any file the work will touch that is missing from the manifest. If the story is genuinely buildable as-is, say so. Do not manufacture questions to look thorough.

### Phase 3 — PM answers, escalating only what it must

Spawn the PM subagent. Context load, then:

Read `01-story.md` and `02-questions.md`. Answer everything you can from the repo, database, specs, or prior decisions — cite the source of each. Write `03-clarified.md`: enriched story with ACs updated to absorb the answers. Mark anything genuinely unresolvable as `ESCALATE: <question>` with options and your recommendation. Escalate only what is truly the business owner's call — cost, risk appetite, product direction, expert judgement. Never escalate what a query would answer.

Then the orchestrator handles escalations **at runtime**. Batch all `ESCALATE:` lines into one user question (max 4, recommended option first). Ask immediately — do not wait for the end of the run. Only this ticket parks; sibling lanes keep going. Append answers to `DECISIONS.md` with date and ticket id; patch them into `03-clarified.md`; resume. No escalations: continue silently.

### Phase 4 — Tech implements

Spawn the Tech subagent. Context load, then:

You are the Tech Lead. Read `03-clarified.md` and `02-questions.md` — the latter is your own prior investigation, including what you already verified. Do not re-derive it. On a rework loop, also read your previous `04-implementation.md` and the QA report. Implement exactly what `03-clarified.md` specifies. Back up every file before modifying it. Write `04-implementation.md`: files changed, approach, what you deliberately did not do, how to verify. Generate `diff.patch`. Touch nothing outside the file manifest. If the work genuinely requires a file not in the manifest, stop and report rather than expanding scope. Honour every rule in `CONTEXT.md`. Do not exceed the ACs.

### Phase 5 — QA verifies, blocking

Spawn a subagent (ticket-qa if defined, else general-purpose). Context load, then:

You are QA on ticket `<ID>`. Your ticket inputs are the acceptance criteria in `03-clarified.md` and the change in `diff.patch`. Do not read `04-implementation.md`. You must not be influenced by how the implementer believes it works. You have full product and architecture context — you are blind to exactly one thing, their reasoning about this change.

**Part 1 — acceptance criteria.** For each numbered AC run an actual check. Record criterion, method, observed output, verdict PASS / FAIL / UNTESTABLE. UNTESTABLE means it cannot be mechanically verified as written — a defect in the ticket, not the code.

**Part 2 — standing gates.** Run every gate in `00-preflight.md` whether or not this ticket mentions it. Compare against `BASELINE.md`: pre-existing failures are not this ticket's fault, new ones are. A gate reporting zero items checked is a FAIL — report it as broken.

**Part 3 — manifest.** List every file the diff touches. Any file outside the manifest is a FAIL regardless of AC results.

**Part 4 — regressions and rule violations.** Check the architectural rules in `CONTEXT.md` directly — a change passing its own ACs while breaking one of them is a FAIL. Then check what the ACs do not mention but the change plausibly breaks, prioritising the failure modes `CONTEXT.md` names as most costly.

Write `05-qa-report.md` with verbatim commands and output as evidence, ending in PASS or FAIL with numbered defects precise enough to act on.

---

## Loop

On FAIL, return to Phase 4 with `05-qa-report.md` as extra input; increment the counter.

- Max 5 rework loops. On the 5th, stop and escalate — the story is probably the problem.
- UNTESTABLE routes back to Phase 3, not Phase 4. A spec defect is not fixed by rebuilding. Cap at 2 round trips.
- Fail fast before spending QA. If typecheck or lint is broken after Phase 4, bounce it without spawning QA.

## Expert-review flag

If the diff touches safety detection, dosing, thresholds, or user-facing consequential copy, QA adds a `REQUIRES EXPERT REVIEW` header naming the exact hunks. The cycle has no expert hat and must not pretend otherwise. PASS means "the code does what the ticket said", never "this is safe to ship."
