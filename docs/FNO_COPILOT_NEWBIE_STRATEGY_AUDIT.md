# FnO Co-Pilot Newbie Strategy Audit

Date: 2026-05-28

## Persona Used

I tested the product as a new FnO trader who understands that options can be used for directional, range-bound and volatility views, but does not yet know how to read PCR, IV, OI, Greeks, max pain or multi-leg payoff charts confidently.

The trader's core goal is not "place an order". The goal is:

1. Understand what the dashboard is saying.
2. Pick one underlying or index.
3. Convert a market view into a defined-risk trade.
4. Analyse max loss, breakeven, payoff and Greeks.
5. Backtest or paper trade before treating it as a repeatable strategy.

## Journey Tested

1. Landed on the FnO dashboard.
2. Tried to understand whether data was live or sample-backed.
3. Read the index cards, PCR, IV, OI and MWPL panels.
4. Opened the contract detail journey.
5. Looked for a safe way to find a beginner-friendly trade.
6. Checked Create Trades, Option Screener and Create Algo Strategies as alternate paths.

## Issues Found

| Severity | Issue | Why It Hurts a New Trader | Fix Applied |
|---|---|---|---|
| Critical | Production UI showed demo/fallback language even after live Upstox plumbing existed. | A trader cannot trust price-sensitive workflows if the product does not clearly say what is live and what is fallback. | Added clearer "Workbook fallback" wording and surfaced live-disabled reason in the UI state. Also patched live parser fallback symbol handling so stock/index live responses map to the selected symbol even when the upstream instrument object is incomplete. |
| High | The dashboard started with market jargon before explaining the decision path. | New users tend to jump into strikes without first deciding view, risk and trade style. | Added a compact "New trader route" strip: Pick, Read, Compare, Analyse. |
| High | PCR, IV, OI and MWPL were visible but not translated. | These are core option-chain inputs, but beginners need plain-language interpretation before using them. | Added a plain-English concept strip for PCR, IV, OI and MWPL. |
| High | Contract detail had metrics but no "what do I do next?" interpretation. | A beginner can see PCR and IV but still not know whether to inspect chain, quick trades or payoff. | Added a contract decision guide with trend, PCR, IV, liquidity and direct actions to Quick Trades or Analyse Trade. |
| Medium | Create Trades mixed AI-led, data-led and manual flows without a safety reminder. | Beginners may treat a suggested strategy as a recommendation instead of a learning artifact. | Added guardrails: use a market view first, prefer capped-risk spreads, check liquidity before Greeks, analyse payoff before entry. |
| Medium | Option Screener exposed many filters at once. | Too many filters creates spreadsheet-like cognitive load. | Added a beginner screening sequence: liquidity, near-ATM, then OI/IV signal. |
| Medium | Algo Strategy Builder looked powerful but intimidating. | New traders may overfit complex rule sets before they understand a simple repeatable setup. | Added an algo route card emphasizing one instrument, one signal, one exit rule, defined-risk legs, validation and backtest. |
| Medium | "Educational demo analysis" copy reduced trust even when a user is analysing a real-looking trade. | The phrase makes the analyser feel fake instead of educational/paper-trading oriented. | Replaced it with "educational paper-trade analysis". |
| Low | Page orientation used emoji labels and dense market terminology. | It made the product feel busy and less like a calm trader IDE. | Simplified guide labels and rewrote instructions in beginner-first language. |

## Product Corrections Made

- Improved live data parsing in `components/FnOCopilot/lib/edgeMarketAdapter.ts`:
  - Handles `symbol`, `tradingSymbol`, `trading_symbol`, `underlyingSymbol` and `underlying_symbol`.
  - Uses the requested active symbol as fallback.
  - Handles alternate spot keys.

- Improved data-state communication in `components/FnOCopilot/FnOCopilotApp.tsx`:
  - Replaced generic demo phrasing with "Workbook fallback".
  - Shows a live-disabled fallback note when frontend edge configuration is unavailable.
  - Keeps the educational framing but removes misleading "demo analysis" language.

- Added beginner UX layers:
  - Dashboard workflow strip.
  - Plain-English concept strip.
  - Contract decision guide.
  - Create Trades guardrail card.
  - Option Screener beginner route.
  - Algo Strategy route card.

## Remaining Recommendations

1. Add a persistent "Data Confidence" drawer that shows: live Upstox status, VPS status, direct Supabase fallback status, last snapshot time, and per-symbol freshness.
2. Add "Why this trade?" explanations to every Top 5 and Quick Trade card.
3. Add a beginner/expert density toggle for the Option Chain.
4. Add an AI prompt shortcut on contract pages: "Explain this chain like I am new to options."
5. Keep Ask AI non-artifact, but store Create Trade, Create Algo and Screener artifacts in history so users can revisit their learning path.
6. Add a risk-first empty state for naked selling attempts: suggest defined-risk spreads instead.

## Verification Notes

- The public production screen showed workbook/demo mode during the audit before the parser fix was applied.
- A read-only production Supabase function call with the Vercel production environment returned `upstox_live`, so the backend path is reachable.
- The current local checkout now hydrates the dashboard as `Live · Upstox Analytics · CLOSING_END` after the parser accepts `instruments[0]` and `overview.instrument`.
- Production still needs a frontend redeploy and Supabase function redeploy to carry the local fixes live.
