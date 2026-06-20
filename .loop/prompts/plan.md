# Codex planning assignment

Act as the Health Twin planner. Do not implement application changes.

Read `AGENTS.md`, the PRD, the acceptance contract, current implementation,
migrations, edge functions, existing tests, `.loop/STATE.json`, and prior loop
artifacts.

Map every acceptance ID to:

- Current behavior and relevant files
- Existing executable evidence
- Gap or risk
- Test that should prove it
- Smallest proposed implementation change

Prioritize actual broken or unverified user flows. A source file containing a
feature is not sufficient evidence that it works.

Write the complete plan to the artifact path supplied by the controller. Include
an ordered implementation checklist and focused verification commands.

Never commit, push, open a PR, merge, deploy, publish n8n workflows, or deploy
Supabase changes.
