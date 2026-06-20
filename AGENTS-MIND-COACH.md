# Mind Coach autonomous engineering loop

Before acting on Mind Coach work, read:

1. `docs/mind-coach/PRD.md`
2. `docs/mind-coach/ACCEPTANCE.md`
3. `docs/MIND_COACH_GAPS.md`
4. `.loop-mind-coach/STATE.json` when it exists
5. The artifacts for the current loop iteration

The repository is the source of truth. Conversation history is not.

**Do not modify** `.loop/`, `health_twin_*.mjs`, or Health Twin `AGENTS.md` / `CLAUDE.md`.

## Roles

- Antigravity plans, runs Phase 0 goal planning, and performs the independent completion check.
- Cursor implements the current plan and fixes verified findings.
- Claude reviews the implementation independently (read-only).
- Antigravity + agent-browser also performs exploratory UI QA (separate stage).
- Deterministic contract and Puppeteer tests perform product QA.

## Autonomous permissions

The loop may autonomously:

- Read and edit Mind Coach application code, tests, migrations, listed n8n definitions, and `.loop-mind-coach/` artifacts.
- Install already-declared dependencies.
- Run builds, tests, local servers, Supabase-safe smoke tests, and browser checks.
- Create and clean up synthetic test records.
- Iterate on implementation and tests.

The loop must never:

- Run `git push`, `gh pr create`, `gh pr merge`, or merge into `main`.
- Start `npm run mind-coach:loop`, `mind_coach_loop.mjs`, or `mind_coach_publish.mjs` from inside an agent stage. Only the outer controller may invoke the loop or publisher.
- Modify `.loop/` or `scripts/health_twin_*.mjs`.
- Publish anything before the independent completion checker returns `COMPLETE`.
- Rotate, print, copy, or commit secrets.
- Use real patient or personally identifiable health data.
- Delete or modify non-test production records.
- Disable RLS or weaken authorization to make a test pass.

After completion, the controller may autonomously:

- Deploy the four Mind Coach Supabase Edge Functions.
- Apply Mind Coach-only database migrations after a guarded dry-run.
- Apply and activate only the Mind Coach n8n workflows listed in config.
- Deploy the application to Vercel production.
- Run post-deployment browser smoke tests.

GitHub publication remains prohibited.

## Verification

At minimum, run:

```bash
npm run build
npm run test:mind-coach:qa
```

Record changed files, commands, results, screenshots, unresolved risks, and the acceptance IDs covered.

## Review focus

When invoked in review mode, compare changes with `main` and prioritize Mind Coach acceptance failures, cross-user data leakage, edge-function and n8n contracts, false-positive tests, chat context leakage, session-end reliability, crisis UX, and controls presented as working without an implementation.
