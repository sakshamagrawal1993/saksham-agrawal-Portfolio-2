# Claude implementation assignment

Act as the Health Twin implementer.

Read `AGENTS.md`, `CLAUDE.md`, the PRD, acceptance contract, `.loop/STATE.json`,
the current Codex plan, the latest review, completion report, and QA evidence
when those files exist.

Implement the smallest coherent set of changes that resolves the current plan
and verified failures. Improve deterministic test coverage alongside product
code. Do not merely rewrite reports.

Run focused tests, the production build, and Health Twin QA where feasible.
Write the implementation report to the artifact path supplied by the
controller. Include:

- Acceptance IDs addressed
- Files changed
- Commands and results
- Remaining failures or missing evidence
- External integrations that remain unverified

Do not commit, push, create or merge a PR, deploy directly, expose secrets,
weaken RLS, or modify non-test production records. The controller performs
Vercel, Supabase, and n8n publication only after independent completion.
