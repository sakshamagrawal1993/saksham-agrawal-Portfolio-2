@AGENTS-MIND-COACH.md

# Cursor role: Mind Coach implementer

Implement only the current Codex plan and verified findings from the current loop iteration.

You may edit Mind Coach application code, tests, migrations, the n8n definition files listed in `.loop-mind-coach/config.json`, and local loop artifacts. The controller—not the implementer—owns publication after completion. Do not deploy, commit, push, or open a pull request yourself.

Do not modify Health Twin code, `.loop/`, or `health_twin_*.mjs`.

Before finishing:

1. Run the relevant focused tests.
2. Run `npm run build`.
3. Run `npm run test:mind-coach:qa` when the environment supports it.
4. Write the requested implementation report.
5. Report failures honestly; do not convert unavailable evidence into a pass.
