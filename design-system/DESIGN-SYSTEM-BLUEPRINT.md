# Design System Blueprint — how the system is built, distributed, and enforced

Audience: you (owner) and any AI coding agent (Claude, Codex, Cursor, Antigravity, Copilot, Windsurf, Gemini).
Scope: `saksham-agrawal-Portfolio-2`, which ships **two** design systems — *Saksham Experiments* (portfolio-wide) and *LibertyMD* (medical product surface).

This document is the "why and how" that sits above the day-to-day rules in
[`AI-DESIGN-RULES.md`](./AI-DESIGN-RULES.md) and the machine-readable
[`design-tokens.json`](./design-tokens.json).

---

## 1. The core idea

A design system that AI agents actually follow is not a Figma file or a PDF. It is **three artifacts that agree with each other**, plus **one mechanism that stops them from drifting apart**:

1. **A single source of truth for values** (tokens) — every color, size, space, radius, and font has one canonical name.
2. **A rules layer that tells agents which token to use and when** (natural-language + per-tool rule files).
3. **A component layer that pre-bakes the tokens** so the correct choice is also the easy choice.
4. **An enforcement layer** (lint + CI) that fails the build when someone hardcodes a value instead of using a token.

Layers 1–3 make the right thing *possible and easy*. Layer 4 makes the wrong thing *impossible to merge*. Most teams build 1–3 and skip 4, then wonder why the system erodes. **You currently have strong 1–3 and no 4** — that is the single biggest fix in this blueprint.

```
                 ┌─────────────────────────────────────────────┐
   author once → │  design-tokens.json  (canonical values)      │  Layer 1
                 └───────────────┬─────────────────────────────┘
                                 │  mirrored into
          ┌──────────────────────┼───────────────────────────┐
          ▼                      ▼                            ▼
   index.css (CSS vars)   tailwind.config.js         Claude Design projects   Layer 1 impl
   --libertymd-*          brand-* / semantic          (visual mirror)
          │                      │
          └──────────┬───────────┘
                     ▼
        components/ui/*  &  components/LibertyMD/*   (tokens pre-baked)        Layer 3
                     │
                     ▼
   AI-DESIGN-RULES.md  →  per-tool rule files (Cursor, Codex, Copilot, …)     Layer 2
                     │
                     ▼
        check-design-tokens.mjs  +  design-guard CI  (fails on raw hex/px)    Layer 4
```

---

## 2. Current-state audit (July 2026)

| Layer | Artifact | Status |
|---|---|---|
| 1 — Tokens (canonical) | `design-system/design-tokens.json` (W3C format, 2 systems) | ✅ Strong |
| 1 — Tokens (CSS impl) | `index.css` — `--libertymd-space-*`, `--libertymd-type-*`, `.libertymd-type-*` | ✅ Wired (44 refs) |
| 1 — Tokens (Tailwind impl) | `tailwind.config.js` — `brand-*`, shadcn semantic HSL vars | ⚠️ Saksham only; LibertyMD scale not exposed as utilities |
| 2 — Human/AI rules | `AI-DESIGN-RULES.md` | ✅ Strong |
| 2 — Cursor | `.cursor/rules/design-system.mdc` (`alwaysApply: true`) | ✅ |
| 2 — Windsurf | `.windsurfrules` | ✅ |
| 2 — Copilot | `.github/copilot-instructions.md` | ✅ |
| 2 — **Codex / Antigravity / Gemini** | `AGENTS.md` | ❌ **No design content** — it's 100% Health-Twin loop |
| 3 — Components | `components/ui/*`, `components/LibertyMD/*` | ✅ Strong |
| 4 — Enforcement | lint / CI / pre-commit | ❌ **Missing entirely** (honor system only) |
| Visual mirror | Claude Design projects (2 IDs in tokens `_meta`) | ✅ Exists; sync command aspirational (see §6) |

### The three real gaps

1. **Codex and Antigravity are flying blind.** The universal convention `AGENTS.md` is the file Codex, Antigravity, Gemini CLI, and Jules read first — and yours contains only the Health-Twin engineering loop, zero design rules. Any of those tools building UI today gets no token guidance. → Fixed by the `AGENTS.md` patch shipped with this blueprint.
2. **Nothing enforces "never hardcode a hex/px."** The golden rule is written in four rule files but nothing checks it. One agent commits `#2563EB` or `padding: 13px` and the system quietly drifts. → Fixed by `scripts/check-design-tokens.mjs` + `design-guard` CI.
3. **LibertyMD color scale isn't a Tailwind utility.** LibertyMD blues/greens/slates live in `design-tokens.json` + `index.css` but not as `bg-libertymd-blue-600`-style classes, so an agent writing a new LibertyMD component has no ergonomic token to reach for and defaults to a raw hex. → Optional Tailwind extension in §5.

---

## 3. Can you use Claude Design for this? Yes — and you already are.

Claude Design (claude.ai/design) is the **visual mirror** of the system — it's where you and stakeholders *see* the tokens and components rendered, and where you can generate/iterate on new screens that stay on-system. Your two projects are already registered in `design-tokens.json` `_meta.claudeDesignProjects`.

Where it fits in the pipeline — and where it does **not**:

- **Do** use Claude Design as the human-facing gallery: review the palette, type scale, and component variants visually; explore new layouts; hand a stakeholder a link instead of a code diff.
- **Do** treat it as a *downstream mirror*: the repo's `design-tokens.json` is the source of truth; Claude Design reflects it. When a token changes in code, re-publish to Claude Design (see §6) — not the other way around.
- **Do not** let Claude Design become a *second* source of truth. If the mirror and the repo disagree, the repo wins. This is the single rule that keeps a visual tool from causing drift.

So Claude Design answers "what does the system look like and how do I explore on-brand ideas," while `design-tokens.json` + the enforcement layer answer "what will actually ship." You want both.

---

## 4. Ingraining the system into every AI tool

Each agentic tool reads a different rule file. The system holds only if **all** of them point at the same source of truth. This is the distribution matrix — keep every row pointing at `AI-DESIGN-RULES.md` and `design-tokens.json`:

| Tool | File it auto-reads | Status | Notes |
|---|---|---|---|
| Claude Code / Claude in this repo | `CLAUDE.md` (→ `@AGENTS.md`) + `AGENTS.md` | ⚠️ via AGENTS patch | `CLAUDE.md` imports `AGENTS.md`, so the AGENTS design section reaches Claude too |
| **Codex** (OpenAI) | `AGENTS.md` | ✅ after patch | Was the biggest hole |
| **Antigravity** (Google) | `AGENTS.md` (+ `.gemini/`, `GEMINI.md`) | ✅ after patch | Reads the `AGENTS.md` standard; patch covers it |
| Gemini CLI / Jules | `AGENTS.md` / `GEMINI.md` | ✅ after patch | Same standard |
| Cursor | `.cursor/rules/design-system.mdc` | ✅ | `alwaysApply: true` — injected every request |
| Windsurf | `.windsurfrules` | ✅ | |
| GitHub Copilot | `.github/copilot-instructions.md` | ✅ | |

**Design principle for these files: thin pointers, one deep doc.** Each tool file should be short and say the same three things — (1) this repo has two systems, (2) full rules live in `AI-DESIGN-RULES.md`, (3) canonical values live in `design-tokens.json`, (4) never hardcode a hex/px. Keep the *detail* in one place (`AI-DESIGN-RULES.md`) so you update rules once, not seven times. Your Cursor/Windsurf/Copilot files already follow this shape; the `AGENTS.md` patch brings it to Codex/Antigravity.

**Prompt-time reinforcement (belt and suspenders).** Even with rule files, start any UI task with an explicit instruction: *"Follow `design-system/AI-DESIGN-RULES.md`. This is a LibertyMD surface — use `--libertymd-*` tokens and reuse `components/LibertyMD/*`. Do not introduce raw hex or px."* Rule files set the default; the prompt removes ambiguity about which of the two systems applies.

---

## 5. Building & extending the system (the authoring loop)

When you add or change a value, do it in this order so the four layers never disagree:

1. **Add the token first.** New value → add to `design-tokens.json` under the right system, with a `role` describing what it's for. If it has no clear role, it probably shouldn't exist.
2. **Implement it.** Saksham → `index.css` + `tailwind.config.js`. LibertyMD → the `--libertymd-*` block in `index.css` (and, per the optional step below, `tailwind.config.js`).
3. **Bake it into a component** if it's reused. A one-off gets a token; a pattern used 3+ times gets a component in `components/ui/*` or `components/LibertyMD/*`.
4. **Update the rules doc** if the change affects *when* to use something (not just its value).
5. **Mirror to Claude Design** (§6).
6. **Let CI verify** nothing hardcoded around the change (Layer 4).

### Optional but recommended: expose LibertyMD colors as Tailwind utilities

Right now an agent building a LibertyMD component can't write `bg-libertymd-blue-600` — so it reaches for `#2563EB`. Close that ergonomic gap by extending `tailwind.config.js`:

```js
// tailwind.config.js → theme.extend.colors
libertymd: {
  blue:  { 900:'#1E3A8A',800:'#1E40AF',700:'#1D4ED8',600:'#2563EB',500:'#3B82F6',50:'#EFF6FF' },
  slate: { 900:'#0F172A',700:'#334155',500:'#64748B',300:'#CBD5E1',200:'#E2E8F0' },
  ink:   '#111827',
  green: { 600:'#169B52', emerald:'#10B981', sage:'#DDE7D8' },
  indigo:'#5661F6',
},
```

Then the correct token (`bg-libertymd-blue-600`) is *shorter* than the raw hex — the strongest possible nudge. Keep these in sync with `design-tokens.json` (the guard in Layer 4 treats the config as a source file, so it won't flag these).

---

## 6. Keeping the visual mirror in sync (Claude Design)

`AI-DESIGN-RULES.md` references `/design-sync` to re-publish to Claude Design, but no such command currently exists in `.claude/commands/`. Two ways to make it real:

- **Manual (works today):** after a token change, open each Claude Design project (IDs in `design-tokens.json` `_meta`) and update the affected palette/type/component so the mirror matches the repo.
- **Automate (recommended):** add a `.claude/commands/design-sync.md` slash command that reads `design-tokens.json` and pushes the diff to the two projects. Until that exists, remove or footnote the `/design-sync` reference in the rules doc so agents don't call a command that isn't there.

Golden direction of sync: **repo → Claude Design**, never the reverse.

---

## 7. One-screen summary for a new agent

> This repo ships two design systems. Read `design-system/AI-DESIGN-RULES.md` and use
> `design-system/design-tokens.json` as the only source of values. LibertyMD surfaces
> (`components/LibertyMD/*`, LibertyMD routes) use Trust Blue `#2563EB`, slate, clinical
> green `#169B52`, `--libertymd-space-*` / `--libertymd-type-*`, Inter + Playfair-italic
> taglines. Everything else uses Saksham Experiments: `brand-*`, shadcn semantic tokens,
> Playfair + Inter, `--radius: 0.5rem`. Reuse existing components — never rebuild a Button
> or Card. Never hardcode a hex or px when a token exists; add the token first. CI will
> reject raw hex/px, so use the tokens.

---

## 8. Maintenance checklist

- [ ] Every tool rule file points at `AI-DESIGN-RULES.md` + `design-tokens.json` (§4 matrix).
- [ ] `AGENTS.md` has the design pointer (closes Codex/Antigravity).
- [x] `design-guard` CI runs in **advisory mode** (reports, never blocks) while the site is
      still being designed.
- [ ] **Later — when the look is settled:** run `npm run design:baseline` on a clean tree,
      switch the CI step and `design:check` from `--warn` to `--ratchet`, and make the check
      required for merge. This is when standardization actually starts enforcing.
- [ ] New values enter via `design-tokens.json` first (§5 order).
- [ ] Claude Design mirror re-published after token changes (§6).
- [ ] `AI-DESIGN-RULES.md` `/design-sync` reference is real or footnoted (§6).
