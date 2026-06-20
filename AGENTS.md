# Health Twin autonomous engineering loop

Before acting on Health Twin work, read:

1. `docs/health-twin/PRD.md`
2. `docs/health-twin/ACCEPTANCE.md`
3. `.loop/STATE.json` when it exists
4. The artifacts for the current loop iteration

The repository is the source of truth. Conversation history is not.

## Roles

- Codex plans and performs the independent completion check.
- Claude implements the current plan and fixes verified findings.
- Codex Review independently reviews the implementation.
- Deterministic Node/Puppeteer tests perform product QA.

## Autonomous permissions

The loop may autonomously:

- Read and edit files inside this repository.
- Install already-declared dependencies.
- Run builds, tests, local servers, Supabase-safe smoke tests, and browser checks.
- Create and clean up synthetic test records.
- Iterate on implementation and tests.

The loop must never:

- Run `git push`, `gh pr create`, `gh pr merge`, or merge into `main`.
- Start `npm run health-twin:loop`, `health_twin_loop.mjs`, or
  `health_twin_publish.mjs` from inside an agent stage. Only the outer controller
  may invoke the loop or publisher.
- Publish anything before the independent completion checker returns `COMPLETE`.
- Rotate, print, copy, or commit secrets.
- Use real patient or personally identifiable health data.
- Delete or modify non-test production records.
- Disable RLS or weaken authorization to make a test pass.

After completion, the controller may autonomously:

- Deploy the five Health Twin Supabase Edge Functions.
- Apply Health Twin-only database migrations after a guarded dry-run.
- Apply and activate only the Health Twin chat and lab n8n workflows.
- Deploy the application to Vercel production.
- Run post-deployment browser smoke tests.

GitHub publication remains prohibited. The loop must not commit, push, create a
pull request, merge, or use a deployment path that implicitly pushes to GitHub.

## Engineering requirements

- Use synthetic health data in fixtures and smoke tests.
- Preserve unrelated user changes.
- Prefer the smallest correct change.
- Treat build success as necessary but insufficient evidence.
- Every acceptance claim must point to a test, database assertion, HTTP result,
  screenshot, or code-level contract check.
- If an external dependency is unavailable, implement a deterministic mock or
  contract test and report the live integration as unverified. Never claim it
  passed.
- Do not mark the product complete while any required acceptance criterion is
  failed, blocked, or missing evidence.

## Verification

At minimum, run:

```bash
npm run build
npm run test:health-twin:qa
```

Record changed files, commands, results, screenshots, unresolved risks, and the
acceptance IDs covered.

## Review focus

When invoked in review mode, compare changes with `main` and prioritize Health
Twin acceptance failures, cross-user data leakage, storage ownership, Edge
Function authorization, n8n contracts, false-positive tests, chat context
leakage, playground mutations, and controls presented as working without an
implementation.
