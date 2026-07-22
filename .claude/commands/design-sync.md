---
description: Sync repo design tokens → the two Claude Design projects (visual mirror)
---

# /design-sync — mirror repo tokens into Claude Design

Direction of truth is **repo → Claude Design, never the reverse**. This command reflects the
current state of the repo's tokens into the two Claude Design projects so the visual mirror
matches what ships. See `design-system/DESIGN-SYSTEM-BLUEPRINT.md` §6.

## Projects (from design-tokens.json `_meta.claudeDesignProjects`)

- **saksham-experiments** → `491ef4bf-91f5-458b-9889-a889c5f95672`
- **libertymd** → `e7f3af3d-9a36-492d-8c13-47fc49240b0c`

## Steps

1. **Read the source of truth.** Load `design-system/design-tokens.json`. This is authoritative
   for every color, font, type-scale, spacing, and radius value.

2. **Cross-check the implementations** so the JSON is not stale before you publish:
   - Saksham: `index.css` (`:root` vars), `tailwind.config.js` (`theme.extend.colors`, `spacing`,
     `fontFamily`, `borderRadius`).
   - LibertyMD: `index.css` `--libertymd-space-*`, `--libertymd-type-*`, and the
     `theme.extend.colors.libertymd` / `spacing.libertymd-*` blocks in `tailwind.config.js`.
   If a value in code disagrees with `design-tokens.json`, **fix `design-tokens.json` first**
   (code wins), then continue. Report every discrepancy you corrected.

3. **Compute the diff to publish.** Compare current tokens against the last synced state
   (`design-system/.design-sync-state.json` if present). List added / changed / removed tokens
   per project. If no state file exists, treat everything as "publish in full."

4. **Update Claude Design.** For each project, update the palette, type scale, spacing, and
   component notes to match the diff. (If a Claude Design connector/MCP is available in this
   session, apply the changes through it against the project IDs above. If not, output a
   precise, copy-pasteable change list per project — token name, old value, new value — for the
   user to apply at claude.ai/design.)

5. **Record the new state.** Write the just-published token snapshot to
   `design-system/.design-sync-state.json` with an ISO timestamp, so the next run diffs cleanly.

6. **Verify.** Run `npm run design:check` to confirm no raw hex/px regressions were introduced,
   and report: discrepancies fixed, tokens published per project, and anything left for the user
   to apply manually.

## Guardrails

- Never invent a token that isn't in `design-tokens.json`.
- Never edit application/component code as part of a sync — this command only reconciles tokens
  and the mirror. Component changes go through the normal design-system workflow.
- If the two systems (`saksham-experiments`, `libertymd`) would ever share a value, keep them as
  separate tokens anyway — they are intentionally distinct systems.
