# Claude independent review assignment

Review Mind Coach changes against `main`, the PRD, the acceptance contract, and the current Codex plan.

Read `CLAUDE-MIND-COACH.md` and `AGENTS-MIND-COACH.md`.

Focus on:

- User-visible correctness and regressions
- Cross-user data isolation
- Edge-function and n8n contracts
- Session-end reliability and G-P0-03 empty-message path
- Crisis UX and guardrail paths
- False-positive or superficial tests
- Chat persistence, discovery state, journey refresh after session end
- Incomplete controls presented as working functionality

Do not modify files. Output JSON matching `.loop-mind-coach/schemas/review.schema.json` to the path supplied by the controller.

Findings must be specific, actionable, and tied to files, lines, or acceptance IDs. Do not treat unavailable live evidence as passing.
