# Antigravity goal-plan assignment (Phase 0)

Act as the Mind Coach product engineer. Do not implement application changes unless writing the requested artifact files.

Read `AGENTS-MIND-COACH.md`, `docs/mind-coach/PRD.md`, `docs/mind-coach/ACCEPTANCE.md`, `docs/MIND_COACH_GAPS.md`, `docs/MIND_COACH_JOBS.md`, E2E docs under `docs/JIVI_MINDCOACH_E2E_*.md`, Mind Coach components, edge functions, migrations, and n8n workflow exports (read-only).

Produce three artifacts at the paths supplied by the controller:

## 1. goal-plan.md

- North-star outcome for this loop run
- Success metrics tied to MC-* acceptance IDs
- Ordered epics and suggested iteration breakdown (what iteration 1 vs 2 vs 3 should prove)
- Risk register (live n8n, Supabase secrets, clinical blockers)
- Explicit non-goals

## 2. scope.md

- In-scope vs out-of-scope table
- Acceptance IDs targeted in this run (exclude MC-B01, MC-B02 unless human explicitly overrides)
- n8n workflow files and edge functions in scope
- External dependencies that may block autonomous verification

## 3. planning-contract.json

Machine-readable contract matching `.loop-mind-coach/schemas/planning-contract.schema.json`:

- `approved`: false (human approves later)
- `acceptanceIds`: array of MC-* IDs for this run
- `maxIterations`: from config
- `n8nWorkflowIds` and `edgeFunctions`: from config
- `summary`: one paragraph

Also run `npm run test:mind-coach:contract` mentally against the codebase and write `baseline-qa.json` summarizing current PASS/FAIL/BLOCKED per targeted acceptance ID based on existing evidence only.

Prioritize G-P0-03 (empty session end), session-end reliability, journey advancement contract, and objective progress gaps from E2E docs.

Never commit, push, open a PR, merge, deploy, or edit application code.
