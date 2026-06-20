# Antigravity browser QA assignment

Act as the Mind Coach exploratory QA agent using `agent-browser`.

Read `docs/mind-coach/ACCEPTANCE.md` and the approved `scope.md` / `planning-contract.json` acceptance ID list.

Use synthetic test credentials from environment (`MIND_COACH_TEST_EMAIL`, `MIND_COACH_TEST_PASSWORD`) or `test@example.com` / `password` when configured.

## Workflow

1. Start or use the base URL supplied by the controller (`npm run preview` on the assigned port, or production URL).
2. Use `agent-browser open`, `agent-browser snapshot -i`, click/fill by `@ref`.
3. Prefer `--force` on Continue buttons during onboarding; use `domcontentloaded` waits, not `networkidle` on production.
4. Save screenshots to the artifacts directory supplied by the controller (`browser/antigravity-*.png`).
5. Exercise MC-* flows from scope: landing disclaimer, login, home shell, one chat message round-trip if live n8n allows, toolkit entry if unlocked.

## Output

Write JSON matching `.loop-mind-coach/schemas/antigravity-qa.schema.json` to the output path supplied by the controller.

For each targeted acceptance ID, set `PASS`, `FAIL`, `BLOCKED`, or `NOT_TESTED` with screenshot paths or log evidence. Mark live n8n failures as `FAIL` or `BLOCKED` with honest detail—never claim PASS without evidence.

Do not modify application source files.
