import { MarketView, StructureFamily, TradeSetup } from '../types';

/**
 * Signal catalog: the closed vocabulary of entry/exit rule presets the agent
 * chooses from. Every signal is executable by the builder (left field,
 * operator, right value all come from the supported lists), carries a
 * description used for both agent selection and UI tooltips, and is tagged so
 * the planner can pre-filter candidates by view/setup/structure family before
 * asking a model to choose.
 *
 * Placeholders resolved at build time: {support} {resistance} {timeStop}.
 */

export type SignalKind = 'entry' | 'exit' | 'both';

export type SignalDef = {
  id: string;
  label: string;
  description: string;
  category: 'range' | 'trend' | 'momentum' | 'mean-reversion' | 'volatility' | 'participation' | 'liquidity' | 'time' | 'expiry' | 'event';
  kind: SignalKind;
  rule: { negate: boolean; left: string; operator: string; right: string };
};

export const SIGNAL_CATALOG: SignalDef[] = [
  // --- Range gates -------------------------------------------------------
  { id: 'price_above_support', label: 'Price above support', category: 'range', kind: 'entry',
    description: 'Spot holds above the put-side OI wall. Gate for premium-selling entries: only sell while the floor holds.',
    rule: { negate: false, left: 'Current Close', operator: 'Is Above', right: '{support}' } },
  { id: 'price_below_resistance', label: 'Price below resistance', category: 'range', kind: 'entry',
    description: 'Spot holds below the call-side OI wall. Pairs with price_above_support to define the range band.',
    rule: { negate: false, left: 'Current Close', operator: 'Is Below', right: '{resistance}' } },
  { id: 'price_breaks_support', label: 'Support breaks', category: 'range', kind: 'exit',
    description: 'Close falls through the support band — the range thesis is invalid; standard stop for credit structures.',
    rule: { negate: false, left: 'Current Close', operator: 'Is Below', right: '{support}' } },
  { id: 'price_breaks_resistance', label: 'Resistance breaks', category: 'range', kind: 'exit',
    description: 'Close rises through the resistance band — range thesis invalid (credit stop) or move captured (long-vol target).',
    rule: { negate: false, left: 'Current Close', operator: 'Is Above', right: '{resistance}' } },
  { id: 'failed_breakout_exit', label: 'Breakout fails', category: 'range', kind: 'exit',
    description: 'Price slips back under the broken resistance — the breakout did not hold, exit the long.',
    rule: { negate: false, left: 'Current Close', operator: 'Is Below', right: '{resistance}' } },
  { id: 'failed_breakdown_exit', label: 'Breakdown fails', category: 'range', kind: 'exit',
    description: 'Price recovers above the broken support — the breakdown did not hold, exit the short.',
    rule: { negate: false, left: 'Current Close', operator: 'Is Above', right: '{support}' } },

  // --- Trend / momentum ----------------------------------------------------
  { id: 'close_crosses_above_sma', label: 'Close crosses above SMA', category: 'trend', kind: 'both',
    description: 'Momentum turn up through the moving average. Bullish entry trigger; also the exit for bearish positions.',
    rule: { negate: false, left: 'Current Close', operator: 'Crosses Above', right: 'sma' } },
  { id: 'close_crosses_below_sma', label: 'Close crosses below SMA', category: 'trend', kind: 'both',
    description: 'Momentum turn down through the moving average. Bearish entry trigger; also the exit for bullish positions.',
    rule: { negate: false, left: 'Current Close', operator: 'Crosses Below', right: 'sma' } },
  { id: 'close_crosses_above_resistance', label: 'Breakout above resistance', category: 'trend', kind: 'entry',
    description: 'Close punches through the resistance band — breakout entry, needs volume confirmation.',
    rule: { negate: false, left: 'Current Close', operator: 'Crosses Above', right: '{resistance}' } },
  { id: 'close_crosses_below_support', label: 'Breakdown below support', category: 'trend', kind: 'entry',
    description: 'Close breaks through the support band — breakdown entry, needs volume confirmation.',
    rule: { negate: false, left: 'Current Close', operator: 'Crosses Below', right: '{support}' } },
  { id: 'price_above_vwap', label: 'Price above VWAP', category: 'trend', kind: 'entry',
    description: 'Intraday trend filter: buyers in control while price holds above VWAP.',
    rule: { negate: false, left: 'Current Close', operator: 'Is Above', right: 'vwap' } },
  { id: 'price_below_vwap', label: 'Price below VWAP', category: 'trend', kind: 'entry',
    description: 'Intraday trend filter: sellers in control while price holds below VWAP.',
    rule: { negate: false, left: 'Current Close', operator: 'Is Below', right: 'vwap' } },
  { id: 'vwap_loss_exit', label: 'Price loses VWAP', category: 'trend', kind: 'exit',
    description: 'Close crosses back below VWAP — intraday longs lose their trend backdrop.',
    rule: { negate: false, left: 'Current Close', operator: 'Crosses Below', right: 'vwap' } },
  { id: 'adx_trending', label: 'ADX confirms trend', category: 'trend', kind: 'entry',
    description: 'ADX above 25 marks a trending market. Add to directional entries; avoid for range-selling.',
    rule: { negate: false, left: 'adx', operator: 'Is Above', right: '25' } },

  // --- Mean reversion (RSI) ----------------------------------------------
  { id: 'rsi_oversold', label: 'RSI oversold', category: 'mean-reversion', kind: 'both',
    description: 'RSI below 30 marks selling exhaustion. Reversal-entry ingredient (with a confirmation cross); also the exit for bearish reversals.',
    rule: { negate: false, left: 'rsi', operator: 'Is Below', right: '30' } },
  { id: 'rsi_overbought', label: 'RSI overbought', category: 'mean-reversion', kind: 'both',
    description: 'RSI above 70 marks buying exhaustion. Bearish-reversal ingredient; also the profit-take for bullish reversals.',
    rule: { negate: false, left: 'rsi', operator: 'Is Above', right: '70' } },
  { id: 'not_overbought', label: 'Avoid overbought entries', category: 'mean-reversion', kind: 'entry',
    description: 'NOT(RSI above 70): skip fresh longs into an already-stretched move.',
    rule: { negate: true, left: 'rsi', operator: 'Is Above', right: '70' } },
  { id: 'not_oversold', label: 'Avoid oversold entries', category: 'mean-reversion', kind: 'entry',
    description: 'NOT(RSI below 30): skip fresh shorts into an already-stretched decline.',
    rule: { negate: true, left: 'rsi', operator: 'Is Below', right: '30' } },
  { id: 'not_rsi_stretched_high', label: 'Avoid exhausted breakouts', category: 'mean-reversion', kind: 'entry',
    description: 'NOT(RSI above 80): a breakout that is already parabolic is late — skip it.',
    rule: { negate: true, left: 'rsi', operator: 'Is Above', right: '80' } },
  { id: 'not_rsi_stretched_low', label: 'Avoid exhausted breakdowns', category: 'mean-reversion', kind: 'entry',
    description: 'NOT(RSI below 20): a breakdown that is already capitulating is late — skip it.',
    rule: { negate: true, left: 'rsi', operator: 'Is Below', right: '20' } },

  // --- Volatility ----------------------------------------------------------
  { id: 'iv_rank_min_30', label: 'IV rank at least 30', category: 'volatility', kind: 'entry',
    description: 'Only sell premium when there is premium to sell — IV rank above 30 keeps credit structures paid.',
    rule: { negate: false, left: 'IV Rank', operator: 'Is Above', right: '30' } },
  { id: 'iv_rank_min_70', label: 'IV rank rich (70+)', category: 'volatility', kind: 'entry',
    description: 'IV rank above 70 — vol is expensive. Entry gate for selling a post-event IV crush.',
    rule: { negate: false, left: 'IV Rank', operator: 'Is Above', right: '70' } },
  { id: 'iv_rank_below_50', label: 'IV rank cheap (<50)', category: 'volatility', kind: 'entry',
    description: 'Buy volatility while it is not yet bid — long straddle/strangle entries want IV rank under 50.',
    rule: { negate: false, left: 'IV Rank', operator: 'Is Below', right: '50' } },
  { id: 'iv_rank_below_60', label: 'IV not fully priced (<60)', category: 'volatility', kind: 'entry',
    description: 'Pre-event gate: some event premium is fine, but skip if IV rank is already above 60 — the move is priced.',
    rule: { negate: false, left: 'IV Rank', operator: 'Is Below', right: '60' } },
  { id: 'not_high_iv', label: 'Avoid rich IV debits', category: 'volatility', kind: 'entry',
    description: 'NOT(IV rank above 75): do not pay top-of-range IV for debit structures like butterflies.',
    rule: { negate: true, left: 'IV Rank', operator: 'Is Above', right: '75' } },
  { id: 'iv_spike_75', label: 'IV spike (75+)', category: 'volatility', kind: 'exit',
    description: 'IV rank spikes above 75 — long-vol positions can book the vol mark-up without waiting for the price move.',
    rule: { negate: false, left: 'IV Rank', operator: 'Is Above', right: '75' } },
  { id: 'iv_spike_80', label: 'Pre-event IV spike (80+)', category: 'volatility', kind: 'exit',
    description: 'Event variant of the IV-spike exit: take profits into the final pre-announcement vol bid.',
    rule: { negate: false, left: 'IV Rank', operator: 'Is Above', right: '80' } },
  { id: 'iv_crush_below_40', label: 'IV crush complete', category: 'volatility', kind: 'exit',
    description: 'IV rank falls under 40 — the crush a short-vol position was selling has played out; close it.',
    rule: { negate: false, left: 'IV Rank', operator: 'Is Below', right: '40' } },

  // --- Participation / liquidity ------------------------------------------
  { id: 'volume_confirmation', label: 'Volume confirmation', category: 'participation', kind: 'entry',
    description: 'Volume above its 20-period average — signals with participation behind them fail less often.',
    rule: { negate: false, left: 'Current Volume', operator: 'Is Above', right: '20 period average' } },
  { id: 'oi_above_avg', label: 'OI building', category: 'participation', kind: 'entry',
    description: 'Open interest above its 20-period average — positions are being built, not unwound.',
    rule: { negate: false, left: 'Current Open Interest', operator: 'Is Above', right: '20 period average' } },
  { id: 'tight_spread', label: 'Tight bid-ask spread', category: 'liquidity', kind: 'entry',
    description: 'Bid-ask spread under 1% — protects fills; especially important for multi-leg structures.',
    rule: { negate: false, left: 'Bid Ask Spread %', operator: 'Is Below', right: '1' } },

  // --- Time / expiry ---------------------------------------------------------
  { id: 'time_stop', label: 'Intraday time stop', category: 'time', kind: 'exit',
    description: 'Square off at {timeStop} — mandatory final exit for intraday strategies.',
    rule: { negate: false, left: 'Time Of Day', operator: 'Equal Or Above', right: '{timeStop}' } },
  { id: 'not_expiry_day', label: 'Skip expiry day', category: 'expiry', kind: 'entry',
    description: 'NOT(days to expire = 0): gamma on expiry day whipsaws both credit sellers and fresh debit entries.',
    rule: { negate: true, left: 'Days To Expire', operator: 'Equal To', right: '0' } },
  { id: 'dte_at_most_3', label: 'Near expiry (≤3 DTE)', category: 'expiry', kind: 'entry',
    description: 'Pin structures (butterflies) work best in the last 3 days before expiry when strikes act as magnets.',
    rule: { negate: false, left: 'Days To Expire', operator: 'Equal Or Below', right: '3' } },
  { id: 'dte_at_least_2', label: 'Room to expiry (≥2 DTE)', category: 'expiry', kind: 'entry',
    description: 'Long-vol entries need at least 2 days to expiry so the position survives to the catalyst.',
    rule: { negate: false, left: 'Days To Expire', operator: 'Equal Or Above', right: '2' } },

  // --- Event anchors ---------------------------------------------------------
  { id: 'event_arm_day_before', label: 'Arm day before results', category: 'event', kind: 'entry',
    description: 'Enter on the session before the scheduled announcement — late enough to limit theta bleed, early enough to beat the final IV bid.',
    rule: { negate: false, left: 'Date', operator: 'Equal To', right: 'result day - 1' } },
  { id: 'event_day_after', label: 'Day after results', category: 'event', kind: 'both',
    description: 'The session after the announcement: exit anchor for long-vol (move captured), entry anchor for selling the IV crush.',
    rule: { negate: false, left: 'Date', operator: 'Equal Or Above', right: 'result day + 1' } },

  // --- Momentum regime (RSI 50 axis) ---------------------------------------
  { id: 'rsi_cross_above_50', label: 'RSI crosses above 50', category: 'momentum', kind: 'entry',
    description: 'Momentum flips to the bull side of the 50 axis — earlier than an oversold bounce, later than a bottom-tick. Trend-confirmation entry.',
    rule: { negate: false, left: 'rsi', operator: 'Crosses Above', right: '50' } },
  { id: 'rsi_cross_below_50', label: 'RSI crosses below 50', category: 'momentum', kind: 'entry',
    description: 'Momentum flips to the bear side of the 50 axis. Trend-confirmation entry for shorts.',
    rule: { negate: false, left: 'rsi', operator: 'Crosses Below', right: '50' } },
  { id: 'momentum_fade_exit', label: 'Momentum fades', category: 'momentum', kind: 'exit',
    description: 'RSI slips back below 50 — the push behind a long is gone even if price has not broken yet. Early, disciplined exit.',
    rule: { negate: false, left: 'rsi', operator: 'Crosses Below', right: '50' } },

  // --- Trend regime ----------------------------------------------------------
  { id: 'adx_range_regime', label: 'ADX confirms range', category: 'trend', kind: 'entry',
    description: 'ADX below 20 marks a directionless market — the gate premium-sellers want before deploying condors/strangles.',
    rule: { negate: false, left: 'adx', operator: 'Is Below', right: '20' } },
  { id: 'close_crosses_above_vwap', label: 'Close reclaims VWAP', category: 'trend', kind: 'entry',
    description: 'Intraday momentum trigger: price crosses back above VWAP after basing — cleaner than buying a falling knife.',
    rule: { negate: false, left: 'Current Close', operator: 'Crosses Above', right: 'vwap' } },
  { id: 'prev_day_high_break', label: 'Previous day high breaks', category: 'trend', kind: 'entry',
    description: 'Close takes out yesterday\'s high — classic continuation trigger, strongest with volume confirmation.',
    rule: { negate: false, left: 'Current Close', operator: 'Is Above', right: 'previous day high' } },
  { id: 'prev_day_low_break', label: 'Previous day low breaks', category: 'trend', kind: 'entry',
    description: 'Close takes out yesterday\'s low — continuation trigger for shorts.',
    rule: { negate: false, left: 'Current Close', operator: 'Is Below', right: 'previous day low' } },

  // --- Volatility (additions) -----------------------------------------------
  { id: 'iv_rank_min_50', label: 'IV rank elevated (50+)', category: 'volatility', kind: 'entry',
    description: 'Middle gate between 30 and 70: enough premium for straddle/strangle selling without demanding a full IV spike.',
    rule: { negate: false, left: 'IV Rank', operator: 'Is Above', right: '50' } },
  { id: 'expected_move_contained', label: 'Expected move modest', category: 'volatility', kind: 'entry',
    description: 'Options price a small move — supportive for credit structures whose short strikes sit outside it.',
    rule: { negate: false, left: 'Expected Move', operator: 'Is Below', right: '1.5% of spot' } },
  { id: 'expected_move_expanding', label: 'Expected move large', category: 'volatility', kind: 'entry',
    description: 'Options price a big move — confirmation for long-vol entries; a warning gate against selling premium.',
    rule: { negate: false, left: 'Expected Move', operator: 'Is Above', right: '1.5% of spot' } },

  // --- Participation (additions) ---------------------------------------------
  { id: 'oi_unwinding', label: 'OI unwinding', category: 'participation', kind: 'entry',
    description: 'Open interest below its 20-period average — positions closing out; pairs with reversal entries (short covering fuel).',
    rule: { negate: false, left: 'Current Open Interest', operator: 'Is Below', right: '20 period average' } },
  { id: 'futures_premium', label: 'Futures at premium', category: 'participation', kind: 'entry',
    description: 'Future trades above spot (contango) — carry sentiment is constructive; supportive gate for bullish entries.',
    rule: { negate: false, left: 'Future Last Traded Price', operator: 'Is Above', right: 'Equity Last Traded Price' } },
  { id: 'futures_discount', label: 'Futures at discount', category: 'participation', kind: 'entry',
    description: 'Future trades below spot (backwardation) — positioning is defensive; supportive gate for bearish entries.',
    rule: { negate: false, left: 'Future Last Traded Price', operator: 'Is Below', right: 'Equity Last Traded Price' } },

  // --- Time / calendar (additions) --------------------------------------------
  { id: 'skip_opening_noise', label: 'Skip opening noise', category: 'time', kind: 'entry',
    description: 'No entries before 09:30 — lets the opening auction and gap volatility settle before signals count.',
    rule: { negate: false, left: 'Time Of Day', operator: 'Equal Or Above', right: '09:30' } },
  { id: 'weekly_expiry_day', label: 'Expiry day only', category: 'expiry', kind: 'entry',
    description: 'Trade only on the weekly expiry day — for deliberate 0DTE structures (butterflies, credit spreads at pin zones).',
    rule: { negate: false, left: 'Day Of Week', operator: 'Equal To', right: 'Thursday' } },
  { id: 'avoid_monday_open', label: 'Avoid Monday entries', category: 'time', kind: 'entry',
    description: 'NOT(day = Monday): skips weekend-gap digestion sessions where technical signals are least reliable.',
    rule: { negate: true, left: 'Day Of Week', operator: 'Equal To', right: 'Monday' } }
];

let signalIndex: Record<string, SignalDef> = Object.fromEntries(SIGNAL_CATALOG.map((signal) => [signal.id, signal]));

/** Kept for compatibility; prefer getSignalById. Rebuilt on hydration. */
export const signalById: Record<string, SignalDef> = signalIndex;

export const getSignalById = (id: string): SignalDef | undefined => signalIndex[id];

/** Row shape of public.algo_signal_catalog in Supabase. */
export type SignalCatalogRow = {
  id: string;
  label: string;
  description: string;
  category: string;
  kind: string;
  negate: boolean;
  left_field: string;
  operator: string;
  right_value: string;
  sort_order?: number;
  active?: boolean;
};

/**
 * Hydrates the in-memory catalog from Supabase rows. Known ids are updated
 * in place (descriptions, rules); new ids are appended. The code catalog
 * remains the fallback when the fetch fails or returns nothing.
 */
export const applySignalRows = (rows: SignalCatalogRow[]): number => {
  let applied = 0;
  for (const row of rows) {
    if (!row?.id || !row.left_field || !row.operator || row.active === false) continue;
    const def: SignalDef = {
      id: row.id,
      label: row.label ?? row.id,
      description: row.description ?? '',
      category: (row.category as SignalDef['category']) ?? 'trend',
      kind: (row.kind === 'entry' || row.kind === 'exit' || row.kind === 'both') ? row.kind : 'both',
      rule: { negate: !!row.negate, left: row.left_field, operator: row.operator, right: row.right_value ?? '' }
    };
    const existingIndex = SIGNAL_CATALOG.findIndex((signal) => signal.id === row.id);
    if (existingIndex >= 0) SIGNAL_CATALOG[existingIndex] = def; else SIGNAL_CATALOG.push(def);
    applied += 1;
  }
  signalIndex = Object.fromEntries(SIGNAL_CATALOG.map((signal) => [signal.id, signal]));
  for (const key of Object.keys(signalById)) delete signalById[key];
  Object.assign(signalById, signalIndex);
  return applied;
};

export type SignalContext = { support: string; resistance: string; timeStop: string };

export const resolveSignalRule = (id: string, ctx: SignalContext): SignalDef['rule'] | null => {
  const signal = signalIndex[id];
  if (!signal) return null;
  const substitute = (value: string) =>
    value.replace('{support}', ctx.support).replace('{resistance}', ctx.resistance).replace('{timeStop}', ctx.timeStop);
  return { ...signal.rule, right: substitute(signal.rule.right) };
};

/**
 * Recipes: which catalog signals compose the entry/exit groups for each
 * structure family + setup. Entries AND-join; exits OR-join.
 */
export type RuleRecipe = { entry: string[]; exit: string[] };

const RECIPES: Record<string, RuleRecipe> = {
  'neutral-credit:default': {
    entry: ['price_above_support', 'price_below_resistance', 'iv_rank_min_30', 'not_expiry_day'],
    exit: ['price_breaks_support', 'price_breaks_resistance', 'time_stop']
  },
  'neutral-credit:event': {
    entry: ['event_day_after', 'iv_rank_min_70', 'not_expiry_day'],
    exit: ['price_breaks_support', 'price_breaks_resistance', 'iv_crush_below_40']
  },
  'pin-debit:default': {
    entry: ['price_above_support', 'price_below_resistance', 'dte_at_most_3', 'not_high_iv'],
    exit: ['price_breaks_support', 'price_breaks_resistance', 'time_stop']
  },
  'volatility-debit:default': {
    entry: ['iv_rank_below_50', 'volume_confirmation', 'not_expiry_day'],
    exit: ['iv_spike_75', 'time_stop']
  },
  'volatility-debit:event': {
    entry: ['event_arm_day_before', 'iv_rank_below_60', 'dte_at_least_2'],
    exit: ['event_day_after', 'iv_spike_80', 'price_breaks_resistance', 'price_breaks_support']
  },
  'directional:bullish:default': {
    entry: ['close_crosses_above_sma', 'volume_confirmation', 'not_overbought'],
    exit: ['close_crosses_below_sma', 'time_stop']
  },
  'directional:bearish:default': {
    entry: ['close_crosses_below_sma', 'volume_confirmation', 'not_oversold'],
    exit: ['close_crosses_above_sma', 'time_stop']
  },
  'directional:bullish:reversal': {
    entry: ['rsi_oversold', 'close_crosses_above_sma', 'volume_confirmation', 'not_expiry_day'],
    exit: ['rsi_overbought', 'close_crosses_below_sma', 'time_stop']
  },
  'directional:bearish:reversal': {
    entry: ['rsi_overbought', 'close_crosses_below_sma', 'volume_confirmation', 'not_expiry_day'],
    exit: ['rsi_oversold', 'close_crosses_above_sma', 'time_stop']
  },
  'directional:bullish:breakout': {
    entry: ['close_crosses_above_resistance', 'volume_confirmation', 'not_rsi_stretched_high'],
    exit: ['failed_breakout_exit', 'time_stop']
  },
  'directional:bearish:breakout': {
    entry: ['close_crosses_below_support', 'volume_confirmation', 'not_rsi_stretched_low'],
    exit: ['failed_breakdown_exit', 'time_stop']
  }
};

/**
 * Per-structure recipe overrides, hydrated from Supabase
 * (algo_strategy_catalog.signal_recipes). Keyed by structure id, then setup
 * key ('default' | 'reversal' | 'breakout' | 'momentum' | 'event').
 * When present these take precedence over the family recipes, which stay as
 * the code-level fallback.
 */
export const STRUCTURE_RECIPES: Record<string, Record<string, RuleRecipe>> = {};

export const applyStructureRecipes = (structureId: string, recipes: Record<string, RuleRecipe> | null | undefined): boolean => {
  if (!recipes || typeof recipes !== 'object') return false;
  const cleaned: Record<string, RuleRecipe> = {};
  for (const [setupKey, recipe] of Object.entries(recipes)) {
    if (recipe && Array.isArray(recipe.entry) && Array.isArray(recipe.exit) && recipe.entry.length && recipe.exit.length) {
      cleaned[setupKey] = { entry: recipe.entry.map(String), exit: recipe.exit.map(String) };
    }
  }
  if (!Object.keys(cleaned).length) return false;
  STRUCTURE_RECIPES[structureId] = cleaned;
  return true;
};

export const recipeFor = (family: StructureFamily, view: MarketView, setup: TradeSetup | null, structureId?: string): RuleRecipe => {
  // 1. Strategy-mapped recipe from the catalog (Supabase) wins.
  if (structureId && STRUCTURE_RECIPES[structureId]) {
    const own = STRUCTURE_RECIPES[structureId];
    const recipe = own[setup ?? 'default'] ?? own['default'];
    if (recipe) return recipe;
  }
  // 2. Family recipe fallback (code).
  const isDirectional = family === 'directional-debit' || family === 'directional-credit';
  const direction = view === 'bearish' ? 'bearish' : 'bullish';
  const keys = isDirectional
    ? [`directional:${direction}:${setup ?? 'default'}`, `directional:${direction}:default`]
    : [`${family}:${setup ?? 'default'}`, `${family}:default`];
  for (const key of keys) if (RECIPES[key]) return RECIPES[key];
  return RECIPES['directional:bullish:default'];
};

/** Resolves the full recipe table for one structure (used to seed/export). */
export const materializeRecipesFor = (family: StructureFamily, view: MarketView): Record<string, RuleRecipe> => {
  const out: Record<string, RuleRecipe> = { default: recipeFor(family, view, null) };
  for (const setup of ['momentum', 'reversal', 'breakout', 'event'] as TradeSetup[]) {
    const recipe = recipeFor(family, view, setup);
    if (recipe !== out.default) out[setup] = recipe;
  }
  return out;
};

/**
 * Inputs the platform cannot honour yet, with plain-language notices and the
 * closest supported alternative. The agent must surface these to the user
 * instead of silently dropping or hallucinating them.
 */
const UNSUPPORTED_INPUTS: Array<{ pattern: RegExp; message: string }> = [
  { pattern: /\bmacd\b/i, message: 'MACD is not available as a rule input yet — I used the closest supported signals (SMA cross with RSI) instead.' },
  { pattern: /\bbollinger\b/i, message: 'Bollinger Bands are not available yet — the support/resistance band gates are the closest supported alternative.' },
  { pattern: /\bsuper\s*trend\b/i, message: 'SuperTrend is not available as a rule input yet — the SMA cross is the closest supported trend trigger.' },
  { pattern: /\bstochastic\b/i, message: 'Stochastic is not available yet — RSI thresholds are the closest supported momentum oscillator.' },
  { pattern: /\bichimoku\b/i, message: 'Ichimoku is not available yet — SMA cross plus ADX is the closest supported trend confirmation.' },
  { pattern: /\bfibonacci|elliott\b/i, message: 'Fibonacci/Elliott levels are not available — OI-wall support/resistance levels are used for zones instead.' },
  { pattern: /\b(?:news|sentiment|twitter|social)\b/i, message: 'News/sentiment signals are not available — event strategies anchor on the scheduled results date instead.' },
  { pattern: /\bfii|dii\b/i, message: 'FII/DII flow data is not available as a rule input yet.' },
  { pattern: /\bdelivery\s*(?:%|percent)/i, message: 'Delivery-percentage data is not available — OI and volume gates are the closest supported participation signals.' },
  { pattern: /\bdelta[-\s]*(?:neutral|hedg)/i, message: 'Automatic delta-hedging adjustments are not available yet — per-leg stop-loss/take-profit is used to manage risk instead.' },
  { pattern: /\bgap\s*(?:up|down)\b/i, message: 'Gap-up/gap-down conditions are not available yet — the SMA/VWAP cross at open is the closest supported alternative.' },
  { pattern: /\brenko\b/i, message: 'Renko-based conditions are not available as rule inputs yet.' },
  { pattern: /\b(?:option\s+)?greeks?\b(?!\s*(?:tab|view))/i, message: 'Greek-based rule conditions (delta/gamma thresholds) are not available from chat yet — delta-based strike selection is available manually in the leg editor.' }
];

export const findUnsupportedInputs = (text: string): string[] =>
  UNSUPPORTED_INPUTS.filter(({ pattern }) => pattern.test(text)).map(({ message }) => message);
