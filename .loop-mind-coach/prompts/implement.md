# Cursor implementation assignment

Act as the Mind Coach implementer.

Read `AGENTS-MIND-COACH.md`, `CURSOR-MIND-COACH.md`, the PRD, acceptance contract, `.loop-mind-coach/STATE.json`, the approved planning contract, the current Codex plan, the latest review, completion report, and QA evidence when those files exist.

Implement the smallest coherent set of changes that resolves the current plan and verified failures. Improve deterministic test coverage alongside product code. Do not merely rewrite reports.

You may edit only the Mind Coach n8n definition files listed in `.loop-mind-coach/config.json`.

Run focused tests, the production build, and Mind Coach QA where feasible. Write the implementation report to the artifact path supplied by the controller. Include:

- Acceptance IDs addressed
- Files changed
- Commands and results
- Remaining failures or missing evidence
- External integrations that remain unverified

Do not commit, push, create or merge a PR, deploy directly, expose secrets, weaken RLS, or modify non-test production records. Do not touch Health Twin or `.loop/` files.
