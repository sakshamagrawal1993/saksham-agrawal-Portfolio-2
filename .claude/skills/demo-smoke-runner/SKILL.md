---
name: demo-smoke-runner
description: This skill should be used when the user asks to "smoke test the demos", "check all portfolio demos", "run demo smoke test", "verify the portfolio still works", "check for broken demos", or wants a regression sweep across every product/case-study route in this portfolio before a deploy or after a shared-dependency change. Use proactively after touching shared code (auth, Supabase client, layout, routing, design-system components) since a single change there can silently break many of the 18 independent product routes.
user-invocable: true
---

# Demo Smoke Runner

Sweeps every route on the portfolio (the 18 product demos/case studies, plus Health Twin and
Mind Coach) for load-time breakage — console errors, failed network calls, blank screens,
crashed routes — and reports a pass/fail table. This is a **regression net for the whole
portfolio**, not a deep functional test of any one product: Health Twin and Mind Coach already
have their own dedicated contract/browser-smoke/QA suites (`test:health-twin:*`,
`test:mind-coach:*`) for that. This skill exists because there is currently no check that
spans *all* products at once — it's how a change to a shared file (auth context, Supabase
client init, a layout component, the router) gets caught before it quietly breaks Runner or
InsightsLM while you were only looking at Mind Coach.

## Use cases

1. **Pre-deploy gate** — before `vercel deploy` / merging to main, confirm no product route
   regressed.
2. **Post shared-change regression check** — after editing anything under a shared path
   (`context/`, `lib/`, `hooks/`, top-level layout, `services/supabaseClient`, router config
   in `App.tsx`), sweep all routes since the blast radius is unknown.
3. **Post-loop-iteration check** — after `health-twin:loop` or `mind-coach:loop` completes an
   iteration, confirm it didn't regress the *other* 16 products it has no awareness of.
4. **Periodic health check** — an ad-hoc or scheduled "is the portfolio still up" sweep.

## Scope: discover routes, don't hardcode them

Routes and the product list change over time — do not rely on a fixed list baked into this
file. At the start of every run:

1. Read `App.tsx` for the route table (lazy-loaded route definitions) and `ProductGrid.tsx`
   (or wherever the homepage grid sources its project list — check `constants.ts`) to enumerate
   every product currently listed.
2. Classify each route into one of three tiers, since the acceptance bar differs:
   - **Tier A — live interactive demo**: has its own component folder under `components/<Name>/`
     and real interactivity (chat, dashboard, game, forms). Currently: Ticketflow, InsightsLM,
     Runner, Trading Agents, FnO Co-Pilot, AI Gating Lab, Health Twin, Mind Coach, Dr. Jivi
     (AI Care), Unity Card — verify against the live route table, this list drifts.
   - **Tier B — static case-study writeup**: a content/detail view with no dedicated app logic
     (e.g. Jivi Agent Orchestrator, Postpe products, Mi Pay, WealthWise AI, ChainSecure ID,
     AdGenius). Lighter check: page renders, no console errors, images/content present.
   - **Tier C — auth-gated entry points**: routes that require login before showing the real
     product (e.g. `/mind-coach/login`, `/health-twin` without a session). These must show a
     login/auth prompt, not a crash, when unauthenticated.
3. If a product can't be confidently classified, default to Tier A (the stricter bar).

## Acceptance criteria — what "pass" means

A route **passes** only if all of the following hold:

- **Loads**: the route resolves to rendered content within a reasonable timeout (~15s cold,
  this is a Vite dev/preview server) — no infinite spinner, no Vite error overlay, no blank
  white screen.
- **No uncaught console errors**: zero `console.error` or uncaught exception entries during
  load and the first interaction (see below). Console warnings are not failures; note them
  but don't fail on them alone.
- **No unhandled promise rejections.**
- **No failed network requests** (4xx/5xx) on initial load, *except* expected auth challenges
  on Tier C routes (e.g. a 401 from a Supabase call before login is expected, not a failure).
- **Key element present** — at least one interaction-bearing element renders for Tier A routes:
  a chat input, a canvas/WebGL surface, a dashboard chart, a form. (Don't drive a full user
  flow — that's the dedicated per-product suites' job. Just prove the route isn't a dead shell.)
- **Tier C routes show an auth prompt**, not a crash, when run unauthenticated.
- A screenshot is captured as evidence regardless of pass/fail.

A route **fails** if any of the above is violated. A route is **blocked** (not failed) if the
smoke runner itself couldn't reach it — e.g. a required env var is missing — distinguish this
from a real product bug in the report.

## Directions for the agent

1. **Reuse the existing pattern, don't reinvent it.** This repo already has browser-smoke
   scripts (`scripts/health_twin_browser_smoke.mjs`, `scripts/mind_coach_browser_smoke.mjs`)
   built on Puppeteer with a consistent shape: spawn a local Vite server on a fixed port, load
   `.env`/`.env.local` for Supabase credentials, attach `console` and request-failure listeners
   before navigating, screenshot to an artifacts directory, write a JSON report with
   pass/fail/blocked counts, exit non-zero on failure, and kill the server in a `finally` block.
   If `scripts/demo_smoke_runner.mjs` doesn't exist yet, create it following that exact shape
   so it's consistent with the rest of the repo's tooling; if it exists, reuse and extend it
   rather than writing a parallel one-off script.
2. **Start the app once**, against a build-equivalent server (`vite preview` after `npm run
   build`, or `npm run dev` if a faster cycle is acceptable for this check) — don't restart it
   per route.
3. **Iterate the discovered route list** (see Scope above). For each route:
   - Reset console/network listeners.
   - Navigate and wait for network idle or a tier-appropriate selector.
   - For Tier A, attempt one trivial interaction relevant to that product if it's cheap and
     obvious (e.g. focus the chat input) — don't author a deep flow per product.
   - Capture a full-page screenshot to `.loop/runs/manual/demo-smoke/<route-slug>.png` (mirror
     the existing artifacts-dir convention).
   - Record status (PASS/FAIL/BLOCKED) with the specific console/network error text on failure.
4. **Never let one route's failure stop the sweep** — catch per-route, continue to the next.
5. **Guardrails**: this skill is read-only against the product — it must not edit application
   code, push to git, or trigger a deploy. If it finds failures, report them; fixing them is a
   separate, explicit step the user asks for next. This matches the loop's own rule (see
   `AGENTS.md`) that automated checks don't self-publish.
6. **Clean up**: kill the spawned server even on error (`finally`), and avoid leaving test data
   behind for any route that required creating a record (mirror the synthetic-record cleanup
   pattern in `health_twin_browser_smoke.mjs` if a route's smoke check needs to create anything).

## Report format

Produce both a JSON artifact (for machine use, same shape as the existing browser-smoke
reports: `{ generatedAt, baseUrl, summary: { passed, failed, blocked, total }, results: [...] }`)
and a short markdown table for the human-facing summary:

| Route | Tier | Status | Notes | Screenshot |
|---|---|---|---|---|
| `/runner` | A | PASS | — | `.loop/runs/manual/demo-smoke/runner.png` |
| `/fno-copilot` | A | FAIL | Console error: `TypeError: cannot read properties of undefined` on load | `.loop/runs/manual/demo-smoke/fno-copilot.png` |

End with the same one-line summary style the existing scripts use: `Demo smoke summary: N
passed, N failed, N blocked (of N total)`. Exit non-zero if any route failed.

## Non-goals

- Not a replacement for `test:health-twin:qa` / `test:mind-coach:qa` — those test deep
  product-specific flows and acceptance criteria; this only proves a route isn't broken.
- Not a visual-regression/pixel-diff tool — screenshots are evidence for a human, not compared
  against a baseline.
- Not a security or RLS test — see `scripts/product_rls_e2e_test.mjs` for that concern.
- Does not test authenticated deep flows on Tier A products beyond the one cheap interaction
  above — full flows belong to each product's own suite.
