# Copilot instructions

This repo has two design systems. Full rules: `design-system/AI-DESIGN-RULES.md`.
Canonical tokens: `design-system/design-tokens.json`.

- **LibertyMD** routes / `components/LibertyMD/*` → Trust Blue `#2563EB`, slate neutrals, clinical green
  `#169B52`, `--libertymd-space-*` spacing, Inter + Playfair-italic tagline. Reuse `components/LibertyMD/*`.
- **Everything else** → Saksham Experiments: brand `#2C2A26`/`#F5F2EB`, shadcn/ui semantic tokens
  (`bg-primary`, `border-border`…), Playfair (`font-serif`) + Inter (`font-sans`), `--radius: 0.5rem`.
  Reuse `components/ui/*` — never rebuild a Button/Card.

Never hardcode a raw hex/px when a token exists; add missing tokens to `design-tokens.json` first.
