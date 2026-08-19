# TypeScript workspace Problems cleanup (2026-08-12)

## Why the Portfolio-2 root was red

Cursor/VS Code paints a multi-root folder **red** when any file under that root has **error-level** diagnostics. This repo’s `tsconfig.json` has:

- `strict: true`
- `noUnusedLocals: true`
- `noUnusedParameters: true`

Those unused-* flags turn dead imports/locals into `TS6133` **errors**, which triggered the explorer badge. This cleanup clears that badge **without turning those flags off**.

## Scope of impact (what this can and cannot affect)

| Layer | In scope? | Notes |
| --- | --- | --- |
| IDE Problems / explorer red badge | **Yes** | Driven by `tsc` / TS language service using this `tsconfig.json`. |
| `npx tsc --noEmit` | **Yes** | Same project. |
| Vite / `npm run build` runtime bundle | **Mostly no** | Unused import removal and dead-helper deletion do not change runtime behavior. JSX still uses the automatic runtime (`jsx: "react-jsx"`). |
| Deno Edge Functions under `supabase/` | **No runtime change** | Already excluded; one Deno script was pulling them into app typecheck via import — that script is now excluded. Functions still typecheck under Deno tooling. |
| One-off Node scripts run with `tsx` / Deno | **Typecheck only** | Excluded scripts still run the same way from the CLI; they are just outside app `tsc`. |
| Product behavior (LibertyMD / UnityCard / etc.) | **Intentional no-ops only** | Removed unused symbols; normalize* helpers preserve the same filtered output via `flatMap`. |
| `noUnusedLocals` / `noUnusedParameters` | **Unchanged** | Still `true`. Future unused code will turn the root red again — that is desired. |

### Out of scope (explicitly not done)

- Did **not** disable `noUnusedLocals` or `noUnusedParameters`.
- Did **not** weaken `strict`.
- Did **not** change CI workflow definitions.
- Did **not** touch other workspace roots (`n8n-workflows`, `bond-ai`, …).

## What changed

### A. `tsconfig.json` exclude additions only

Added to `exclude` (same pattern as existing Deno/script exclusions):

- `scripts/libertymd-flow-simulation.ts` — Deno triple-slash / `Deno` globals; was also pulling `supabase/functions/...` into the app project graph.
- `scripts/publish_phase4_post.ts` — one-off `tsx` publisher with Supabase client generics that do not match the app `tsc` graph.

**Impact:** these two files are no longer typechecked by the **app** `tsconfig`. They still execute when invoked with Deno/`tsx` as before. Re-add them to the `include` graph only if you intentionally want app-`tsc` to own them (and then fix their types for that environment).

### B. Dead code / unused imports (TS6133)

Removed unused imports, locals, or dead helpers in:

- `components/AICare/AICareObservations.tsx` — unused `sessionStatus` state
- `components/blog/PostViewer.tsx`
- `components/FnOCopilot/FnOCopilotApp.tsx` — dead `_readLines` / `_toLines` / `_riskBox`; typed map index
- `components/LibertyMD/LibertyMD3DBlobLogo.tsx`
- `components/LibertyMD/LibertyMDApp.tsx` — unused `LibertyMDScrollFilmSection` import
- `components/LibertyMD/LibertyMDFooterBadges.tsx`
- `components/LibertyMD/LibertyMDFooterRibbon.tsx`
- `components/LibertyMD/LibertyMDHumanSilhouettes.tsx`
- `components/LibertyMD/LibertyMDMarketingSections.tsx` — unused lucide icons
- `components/LibertyMD/LibertyMDMedicalCrossLogo.tsx`
- `components/LibertyMD/LibertyMDParticleWaveSeparator.tsx`
- `components/LibertyMD/LibertyMDPhaseStack.tsx` — unused `floorPedestalPath`
- `components/LibertyMD/libertymd-failure-taxonomy.ts` — rename unused param → `_status` (call sites unchanged)
- `components/MindCoach/BottomNav.tsx`
- `components/MindCoach/Screens/SessionsScreen.tsx`
- `components/TradingAgents/TradingAgentsApp.tsx`
- `components/UnityCard/Steps/{Aadhaar,Offer,Processing,VideoKyc}Step.tsx`
- `components/UnityCard/UnityCardDashboard.tsx`
- `components/UnityCard/UnityCardLanding.tsx` — unused SVG icon components
- `components/UnityCard/UnityCardOnboarding.tsx`

### C. Real type fixes (not unused-code)

- `components/LibertyMD/libertymd-care-proxy-client.ts` — `normalizePatientList` / `normalizeHistorySummary` now use `flatMap` instead of `map` + type-predicate `filter` (fixes TS2322 / TS2677). Runtime filter semantics unchanged: invalid/null rows still dropped.

## Verification

```bash
npx tsc --noEmit   # must report 0 errors
```

Optional: `npm run build` to confirm the Vite app still compiles.

## How to reverse if something breaks

### 1. Prefer surgical restore (recommended)

Restore only the suspicious file(s) from the pre-cleanup commit (or from git history after this lands):

```bash
# Example: put PhaseStack back exactly as it was on main tip before cleanup
git checkout HEAD -- components/LibertyMD/LibertyMDPhaseStack.tsx

# Or restore from a known-good SHA recorded when cleanup landed:
git checkout <pre-cleanup-sha> -- path/to/file
```

Re-run `npx tsc --noEmit` after each restore so you know which file reintroduced diagnostics.

### 2. Reverse only the tsconfig exclude change

If a Deno/`tsx` script must be typechecked by the app project again:

1. Remove its path from `tsconfig.json` → `exclude`.
2. Fix that script’s types for the **browser/Node app** lib (or give it a dedicated `tsconfig.*.json`).
3. Do **not** re-include all of `supabase/` in the app project unless you intend to.

```bash
git checkout HEAD -- tsconfig.json   # if the only bad change was exclude
```

### 3. Full revert of the cleanup commit

If the cleanup is a dedicated commit:

```bash
git revert <cleanup-commit-sha>
npx tsc --noEmit
```

If it was mixed with other WIP, use path-scoped checkout from `<pre-cleanup-sha>` for the file list in section B/C above — do not blindly `git reset --hard` on a dirty tree.

### 4. Emergency: silence unused diagnostics (last resort)

Only if you must unblock the IDE immediately and cannot restore files:

```json
"noUnusedLocals": false,
"noUnusedParameters": false
```

**Impact:** explorer red from unused code goes away; dead code can accumulate; this does **not** hide real type errors under `strict`. Reverse by setting both back to `true` and re-cleaning. Prefer this over deleting product logic you are unsure about.

## Rollback checklist

1. Note current SHA: `git rev-parse HEAD`
2. Reproduce the failure (route / script / test).
3. Restore the smallest set of files from section B/C.
4. Confirm: `npx tsc --noEmit` and the failing user flow.
5. If exclude-related: restore `tsconfig.json` excludes and re-verify scripts with their native runners (`deno` / `tsx`), not only app `tsc`.

## Update: `baseUrl` deprecation (same day follow-up)

IDE / newer TypeScript language service reported on `tsconfig.json` L24:

> Option `baseUrl` is deprecated and will stop functioning in TypeScript 7.0.

**Fix applied:** removed `"baseUrl": "."` and kept `"paths": { "@/*": ["./*"] }` (paths already carried the `.` prefix). This is the official TS 6 migration for projects that only used `baseUrl` as a paths prefix.

**Impact:** typecheck path aliases for `@/*` only. Vite resolves `@` separately via its own alias config — verify `vite.config.ts` still maps `@` → project root.

**Reverse:** restore `"baseUrl": "."` next to `paths`, or temporarily set `"ignoreDeprecations": "6.0"` (stopgap until TS 7).
