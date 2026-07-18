# Design System Rules (for AI coding assistants)

This repo has **two** design systems. Follow the right one for the surface you're building.
Canonical tokens: [`design-system/design-tokens.json`](./design-tokens.json).
Both are mirrored in **Claude Design** (claude.ai/design) as **Saksham Experiments** and **LibertyMD**.

> Golden rule: **never hardcode a raw hex or px value** if a token exists for it. Reference the token
> (Tailwind class or CSS variable). If a value is missing, add it to `design-tokens.json` first, then use it.

---

## 1. Saksham Experiments — portfolio-wide system
Use for: the portfolio shell, journal/blog, case-study pages, marketing, dashboard, and every product route **except** LibertyMD.

- **Type:** `font-serif` = Playfair Display (headings/display), `font-sans` = Inter (body/UI).
- **Brand color:** `brand-dark #2C2A26` (ink), `brand-light #F5F2EB` (canvas), `brand-text #5D5A53` (body), `brand-gray #A8A29E`, gold `#8B7644` (links/rules).
- **Semantic color:** shadcn/ui HSL CSS variables — use `bg-primary`, `text-muted-foreground`, `border-border`, etc. Never the raw hex.
- **Radius:** `--radius: 0.5rem` (`rounded-lg` / `rounded-md` / `rounded-sm`).
- **Components:** reuse `components/ui/*` (Button, Badge, Card, Input, Select, Tabs, Dialog, Table…). Do **not** build a new button — use `<Button variant=…>`. Variants: `default | secondary | destructive | outline | ghost | link`; sizes `sm | default | lg | icon`.

## 2. LibertyMD — medical product system
Use **only** for LibertyMD routes / `components/LibertyMD/*`.

- **Fonts:** Playfair Display for the hero and editorial marketing headings (italic only for editorial taglines); Inter for UI, body, chat, cards, reports, oath, and legal text. These are the only LibertyMD font families.
- **Type scale:** use the semantic `--libertymd-type-*` tokens and matching `.libertymd-type-*` classes in `index.css`. Display `56/72`, section title `36/48`, subsection title `30/36`, card title `20`, lead `18`, body/chat `16`, supporting body `14`, label/legal `12`, and footer oath `18/24` (mobile/desktop where two values are listed). Do not invent intermediate sizes for new LibertyMD surfaces.
- **Color:** primary **Trust Blue `#2563EB`** (scale 900→50), slate neutrals for ink/structure, **clinical green `#169B52`** for positive/in-network, indigo `#5661F6` accent, soft blue/green **surface wash** gradient.
- **Spacing:** semantic 4px-grid scale via `--libertymd-space-*` (`xs 4 → section 64`). Use these, not arbitrary px.
- **Components:** reuse `components/LibertyMD/*` (logo lockups, trust badges, CTA buttons, marketing sections, footer ribbon). CTAs use the blue gradient + `10px` radius + blue glow shadow.
- **Do not** mix in Saksham brand tones (warm beige/gold) — LibertyMD is cool blue/slate/green.

---

## How to keep it in sync
- Tokens change → edit `index.css` / `tailwind.config.js` (Saksham) or the `--libertymd-space-*` block + `components/LibertyMD` (LibertyMD), **and** mirror the change in `design-system/design-tokens.json`.
- To re-publish the visual cards to Claude Design, run `/design-sync` in Claude Code from the repo root (updates the two existing projects incrementally).
