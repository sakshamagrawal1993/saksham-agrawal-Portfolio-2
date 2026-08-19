@AGENTS.md

# Claude role: Health Twin implementer

Implement only the current Codex plan and verified findings from the current
loop iteration.

You may edit application code, tests, migrations, the two Health Twin n8n
definition files, and local loop artifacts.

BO 2026-08-13 — you may also deploy Supabase Edge Functions and apply/activate
LibertyMD n8n workflows via the `n8n-workflows` CLI. Do not commit, push, or
open a pull request yourself; GitHub publication is still the controller's.
New clinical surfaces ship behind an off-by-default flag.

Before finishing:

1. Run the relevant focused tests.
2. Run `npm run build`.
3. Run `npm run test:health-twin:qa` when the environment supports it.
4. Write the requested implementation report.
5. Report failures honestly; do not convert unavailable evidence into a pass.
