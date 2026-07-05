import { AlgoPlan, AlgoRule, MarketView, RuleConnector, StrategyStructureId, StrikeLevel, StructureFamily, TemplateLegSpec, TradeSetup } from '../types';
import { applyStructureRecipes, recipeFor, resolveSignalRule } from './signalCatalog';

/**
 * FnO strategy structure library.
 *
 * Every structure is defined the way options platforms (Sensibull, AlgoTest,
 * Upstox Algoverse, Opstra) define them: legs at relative strike levels
 * (ITM n / ATM / OTM n), with buy/sell side, option type, and lot multipliers.
 * Chat can override the body (short) level and the wing level independently,
 * e.g. "sell OTM 1 strikes with wings at OTM 3".
 */

export const STRIKE_LEVELS: StrikeLevel[] = ['ITM 5', 'ITM 4', 'ITM 3', 'ITM 2', 'ITM 1', 'ATM', 'OTM 1', 'OTM 2', 'OTM 3', 'OTM 4', 'OTM 5'];

const leg = (
  role: TemplateLegSpec['role'],
  side: TemplateLegSpec['side'],
  optionType: TemplateLegSpec['optionType'],
  strikeOffset: StrikeLevel,
  lotsMultiplier = 1,
  applyRisk = side === 'Sell' || role === 'directional' || role === 'body',
  extras: Pick<TemplateLegSpec, 'instrument' | 'expiryOffset'> = {}
): TemplateLegSpec => ({ role, side, optionType, strikeOffset, lotsMultiplier, applyRisk, ...extras });

type StructureDefinition = {
  label: string;
  view: MarketView;
  family: StructureFamily;
  legs: TemplateLegSpec[];
  /** Longer aliases must come first when scanning; handled by detectStructure sort. */
  aliases: string[];
  notes: string;
};

/**
 * Selection metadata per structure: used by the agent (and the n8n prompt)
 * to pick a structure from the user's hypothesis, and by the UI to explain
 * the choice in plain language.
 */
export type StructureMeta = {
  chooseWhen: string;
  ivRegime: 'high-iv' | 'low-iv' | 'any';
  riskProfile: 'defined' | 'undefined';
  marginClass: 'low' | 'medium' | 'high';
};

export const STRUCTURE_META: Record<StrategyStructureId, StructureMeta> = {
  'iron-condor': { chooseWhen: 'Rangebound view with decent premium (IV rank 30+); wants defined risk while collecting theta.', ivRegime: 'high-iv', riskProfile: 'defined', marginClass: 'medium' },
  'iron-butterfly': { chooseWhen: 'Rangebound with a strong pin expectation near ATM/max-pain; richer credit than a condor, tighter profit zone.', ivRegime: 'high-iv', riskProfile: 'defined', marginClass: 'medium' },
  'call-butterfly': { chooseWhen: 'Expiry-pin play near a target above/at spot; cheap defined debit, best in the last 1-3 days to expiry.', ivRegime: 'low-iv', riskProfile: 'defined', marginClass: 'low' },
  'put-butterfly': { chooseWhen: 'Expiry-pin play with the body at/below spot; put-side mirror of the call butterfly.', ivRegime: 'low-iv', riskProfile: 'defined', marginClass: 'low' },
  'short-strangle': { chooseWhen: 'Strong rangebound conviction and margin comfort; maximum theta but undefined risk — needs hard stops.', ivRegime: 'high-iv', riskProfile: 'undefined', marginClass: 'high' },
  'long-strangle': { chooseWhen: 'Expecting a large move either way but wanting a cheaper ticket than a straddle; needs a bigger move to pay off.', ivRegime: 'low-iv', riskProfile: 'defined', marginClass: 'low' },
  'short-straddle': { chooseWhen: 'Pin + IV-crush conviction at ATM; highest credit and highest risk of the neutral set.', ivRegime: 'high-iv', riskProfile: 'undefined', marginClass: 'high' },
  'long-straddle': { chooseWhen: 'Big move expected, direction unknown — events, results, breakout coils. Buy before IV is fully bid.', ivRegime: 'low-iv', riskProfile: 'defined', marginClass: 'low' },
  'bull-call-spread': { chooseWhen: 'Moderately bullish to a target; defined debit with reduced theta versus a naked call.', ivRegime: 'any', riskProfile: 'defined', marginClass: 'low' },
  'bear-put-spread': { chooseWhen: 'Moderately bearish to a target; defined debit downside expression.', ivRegime: 'any', riskProfile: 'defined', marginClass: 'low' },
  'bull-put-spread': { chooseWhen: 'Bullish-to-neutral with support below; collect credit if the floor holds, defined risk.', ivRegime: 'high-iv', riskProfile: 'defined', marginClass: 'medium' },
  'bear-call-spread': { chooseWhen: 'Bearish-to-neutral with resistance above; collect credit if the ceiling holds, defined risk.', ivRegime: 'high-iv', riskProfile: 'defined', marginClass: 'medium' },
  'call-buy': { chooseWhen: 'Strongly bullish with a fresh signal (cross, reversal, breakout); simplest long-delta ticket.', ivRegime: 'low-iv', riskProfile: 'defined', marginClass: 'low' },
  'put-buy': { chooseWhen: 'Strongly bearish or hedging; simplest short-delta ticket.', ivRegime: 'low-iv', riskProfile: 'defined', marginClass: 'low' },
  'call-ratio-spread': { chooseWhen: 'Mildly bullish to a specific level with rich call skew; wants a near-zero-cost structure and accepts risk above the short strike.', ivRegime: 'high-iv', riskProfile: 'undefined', marginClass: 'high' },
  'put-ratio-spread': { chooseWhen: 'Mildly bearish to a support level with rich put skew; accepts risk below the short strike.', ivRegime: 'high-iv', riskProfile: 'undefined', marginClass: 'high' },
  'call-calendar': { chooseWhen: 'Pin expectation at a strike with cheap far-dated IV; harvests weekly theta while staying long vega into events.', ivRegime: 'low-iv', riskProfile: 'defined', marginClass: 'medium' },
  'covered-call': { chooseWhen: 'Own the trend but expect it to slow; rents out upside beyond OTM 2 for income. Future leg carries full downside.', ivRegime: 'high-iv', riskProfile: 'undefined', marginClass: 'high' },
  'protective-put': { chooseWhen: 'Bullish but nervous — long future with a paid-for floor; the put premium is the insurance cost.', ivRegime: 'low-iv', riskProfile: 'defined', marginClass: 'high' },
  collar: { chooseWhen: 'Holding a position through uncertainty; wants the floor nearly free by capping upside.', ivRegime: 'any', riskProfile: 'defined', marginClass: 'high' },
  'broken-wing-butterfly': { chooseWhen: 'Rangebound-to-slightly-bullish with put skew to sell; credit entry, no upside risk, tail risk only below the far wing.', ivRegime: 'high-iv', riskProfile: 'defined', marginClass: 'medium' },
  'jade-lizard': { chooseWhen: 'Neutral-to-bullish premium sale; kills upside risk versus a strangle while keeping most of the credit.', ivRegime: 'high-iv', riskProfile: 'undefined', marginClass: 'high' }
};

export const STRUCTURE_LIBRARY: Record<StrategyStructureId, StructureDefinition> = {
  'iron-condor': {
    label: 'Iron Condor',
    view: 'rangebound',
    family: 'neutral-credit',
    legs: [
      leg('body', 'Sell', 'PE', 'OTM 2'),
      leg('wing', 'Buy', 'PE', 'OTM 4', 1, false),
      leg('body', 'Sell', 'CE', 'OTM 2'),
      leg('wing', 'Buy', 'CE', 'OTM 4', 1, false)
    ],
    aliases: ['iron condor', 'condor'],
    notes: 'Defined-risk range credit: short OTM 2 strangle hedged with OTM 4 wings.'
  },
  'iron-butterfly': {
    label: 'Iron Butterfly',
    view: 'rangebound',
    family: 'neutral-credit',
    legs: [
      leg('body', 'Sell', 'PE', 'ATM'),
      leg('wing', 'Buy', 'PE', 'OTM 3', 1, false),
      leg('body', 'Sell', 'CE', 'ATM'),
      leg('wing', 'Buy', 'CE', 'OTM 3', 1, false)
    ],
    aliases: ['iron butterfly', 'iron fly', 'ironfly'],
    notes: 'ATM short straddle hedged with OTM 3 wings; max theta near max pain, high pin sensitivity.'
  },
  'call-butterfly': {
    label: 'Long Call Butterfly',
    view: 'rangebound',
    family: 'pin-debit',
    legs: [
      leg('wing', 'Buy', 'CE', 'ITM 2', 1, false),
      leg('body', 'Sell', 'CE', 'ATM', 2),
      leg('wing', 'Buy', 'CE', 'OTM 2', 1, false)
    ],
    aliases: ['call butterfly', 'butterfly spread', 'long butterfly', 'butterfly'],
    notes: 'Debit butterfly: buy ITM 2 and OTM 2 calls, sell 2× ATM calls. Profits from a pin at the body.'
  },
  'put-butterfly': {
    label: 'Long Put Butterfly',
    view: 'rangebound',
    family: 'pin-debit',
    legs: [
      leg('wing', 'Buy', 'PE', 'OTM 2', 1, false),
      leg('body', 'Sell', 'PE', 'ATM', 2),
      leg('wing', 'Buy', 'PE', 'ITM 2', 1, false)
    ],
    aliases: ['put butterfly'],
    notes: 'Put-side mirror of the long butterfly.'
  },
  'short-strangle': {
    label: 'Short Strangle',
    view: 'rangebound',
    family: 'neutral-credit',
    legs: [
      leg('body', 'Sell', 'PE', 'OTM 2'),
      leg('body', 'Sell', 'CE', 'OTM 2')
    ],
    aliases: ['short strangle', 'sell strangle', 'strangle sell'],
    notes: 'Undefined-risk premium sale at OTM 2 both sides; requires hard stops and margin awareness.'
  },
  'long-strangle': {
    label: 'Long Strangle',
    view: 'volatile',
    family: 'volatility-debit',
    legs: [
      leg('directional', 'Buy', 'PE', 'OTM 2'),
      leg('directional', 'Buy', 'CE', 'OTM 2')
    ],
    aliases: ['long strangle', 'buy strangle', 'strangle'],
    notes: 'Cheap convexity both sides; needs a move beyond both OTM 2 strikes plus premium.'
  },
  'short-straddle': {
    label: 'Short Straddle',
    view: 'rangebound',
    family: 'neutral-credit',
    legs: [
      leg('body', 'Sell', 'PE', 'ATM'),
      leg('body', 'Sell', 'CE', 'ATM')
    ],
    aliases: ['short straddle', 'sell straddle', 'straddle sell'],
    notes: 'Max premium capture at ATM; undefined risk, tight SL mandatory.'
  },
  'long-straddle': {
    label: 'Long Straddle',
    view: 'volatile',
    family: 'volatility-debit',
    legs: [
      leg('directional', 'Buy', 'CE', 'ATM'),
      leg('directional', 'Buy', 'PE', 'ATM')
    ],
    aliases: ['long straddle', 'buy straddle', 'straddle'],
    notes: 'ATM call + put; profits from a large move either side or an IV expansion.'
  },
  'bull-call-spread': {
    label: 'Bull Call Spread',
    view: 'bullish',
    family: 'directional-debit',
    legs: [
      leg('directional', 'Buy', 'CE', 'ITM 1'),
      leg('hedge', 'Sell', 'CE', 'OTM 2', 1, false)
    ],
    aliases: ['bull call spread', 'call spread', 'call debit spread'],
    notes: 'Buy ITM 1 call, sell OTM 2 call: defined-risk upside with reduced theta bleed.'
  },
  'bear-put-spread': {
    label: 'Bear Put Spread',
    view: 'bearish',
    family: 'directional-debit',
    legs: [
      leg('directional', 'Buy', 'PE', 'ITM 1'),
      leg('hedge', 'Sell', 'PE', 'OTM 2', 1, false)
    ],
    aliases: ['bear put spread', 'put spread', 'put debit spread'],
    notes: 'Buy ITM 1 put, sell OTM 2 put: defined-risk downside expression.'
  },
  'bull-put-spread': {
    label: 'Bull Put Spread',
    view: 'bullish',
    family: 'directional-credit',
    legs: [
      leg('body', 'Sell', 'PE', 'OTM 2'),
      leg('wing', 'Buy', 'PE', 'OTM 4', 1, false)
    ],
    aliases: ['bull put spread', 'put credit spread'],
    notes: 'Credit spread below support: profits if support holds, risk capped by the OTM 4 wing.'
  },
  'bear-call-spread': {
    label: 'Bear Call Spread',
    view: 'bearish',
    family: 'directional-credit',
    legs: [
      leg('body', 'Sell', 'CE', 'OTM 2'),
      leg('wing', 'Buy', 'CE', 'OTM 4', 1, false)
    ],
    aliases: ['bear call spread', 'call credit spread'],
    notes: 'Credit spread above resistance: profits if resistance holds.'
  },
  'call-buy': {
    label: 'Momentum Call Buy',
    view: 'bullish',
    family: 'directional-debit',
    legs: [leg('directional', 'Buy', 'CE', 'ATM')],
    aliases: ['call buy', 'buy call', 'long call', 'naked call buy'],
    notes: 'Single ATM call with signal-gated entry.'
  },
  'put-buy': {
    label: 'Momentum Put Buy',
    view: 'bearish',
    family: 'directional-debit',
    legs: [leg('directional', 'Buy', 'PE', 'ATM')],
    aliases: ['put buy', 'buy put', 'long put', 'naked put buy'],
    notes: 'Single ATM put with signal-gated entry.'
  },
  'call-ratio-spread': {
    label: 'Call Ratio Spread',
    view: 'bullish',
    family: 'directional-credit',
    legs: [
      leg('directional', 'Buy', 'CE', 'ATM'),
      leg('body', 'Sell', 'CE', 'OTM 2', 2)
    ],
    aliases: ['call ratio spread', 'ratio call spread', 'call ratio', 'ratio spread', '1x2 call'],
    notes: 'Buy 1 ATM call, sell 2 OTM 2 calls: profits on a drift up to the short strike; risk opens up beyond it.'
  },
  'put-ratio-spread': {
    label: 'Put Ratio Spread',
    view: 'bearish',
    family: 'directional-credit',
    legs: [
      leg('directional', 'Buy', 'PE', 'ATM'),
      leg('body', 'Sell', 'PE', 'OTM 2', 2)
    ],
    aliases: ['put ratio spread', 'ratio put spread', 'put ratio', '1x2 put'],
    notes: 'Buy 1 ATM put, sell 2 OTM 2 puts: profits on a drift down to the short strike; risk opens up below it.'
  },
  'call-calendar': {
    label: 'Call Calendar Spread',
    view: 'rangebound',
    family: 'pin-debit',
    legs: [
      leg('body', 'Sell', 'CE', 'ATM'),
      leg('hedge', 'Buy', 'CE', 'ATM', 1, false, { expiryOffset: 'far' })
    ],
    aliases: ['calendar spread', 'call calendar', 'time spread', 'horizontal spread', 'calendar'],
    notes: 'Sell near-expiry ATM call, buy the same strike one expiry out: harvests near-dated theta while staying long vega.'
  },
  'covered-call': {
    label: 'Covered Call (Futures)',
    view: 'bullish',
    family: 'directional-credit',
    legs: [
      leg('directional', 'Buy', 'CE', 'ATM', 1, true, { instrument: 'Future' }),
      leg('body', 'Sell', 'CE', 'OTM 2', 1, false)
    ],
    aliases: ['covered call'],
    notes: 'Long future plus short OTM 2 call: income on a mildly bullish view; the future carries the downside risk.'
  },
  'protective-put': {
    label: 'Protective Put (Futures)',
    view: 'bullish',
    family: 'directional-debit',
    legs: [
      leg('directional', 'Buy', 'CE', 'ATM', 1, true, { instrument: 'Future' }),
      leg('hedge', 'Buy', 'PE', 'OTM 2', 1, false)
    ],
    aliases: ['protective put', 'married put'],
    notes: 'Long future insured with an OTM 2 put: bullish exposure with a hard floor under losses.'
  },
  collar: {
    label: 'Collar (Futures)',
    view: 'bullish',
    family: 'directional-credit',
    legs: [
      leg('directional', 'Buy', 'CE', 'ATM', 1, true, { instrument: 'Future' }),
      leg('hedge', 'Buy', 'PE', 'OTM 2', 1, false),
      leg('hedge', 'Sell', 'CE', 'OTM 2', 1, false)
    ],
    aliases: ['collar'],
    notes: 'Long future, put floor, call cap: cheap insurance funded by giving up upside beyond OTM 2.'
  },
  'broken-wing-butterfly': {
    label: 'Broken-Wing Butterfly',
    view: 'rangebound',
    family: 'neutral-credit',
    legs: [
      leg('wing', 'Buy', 'PE', 'OTM 1', 1, false),
      leg('body', 'Sell', 'PE', 'OTM 2', 2),
      leg('wing', 'Buy', 'PE', 'OTM 4', 1, false)
    ],
    aliases: ['broken wing butterfly', 'broken-wing butterfly', 'broken wing', 'bwb', 'skip strike butterfly'],
    notes: 'Put butterfly with a skipped far wing: entered for a credit, no upside risk, defined downside below the far wing.'
  },
  'jade-lizard': {
    label: 'Jade Lizard',
    view: 'rangebound',
    family: 'neutral-credit',
    legs: [
      leg('body', 'Sell', 'PE', 'OTM 2'),
      leg('body', 'Sell', 'CE', 'OTM 2'),
      leg('wing', 'Buy', 'CE', 'OTM 4', 1, false)
    ],
    aliases: ['jade lizard'],
    notes: 'Short strangle with the call side capped: when total credit exceeds the call-spread width there is no upside risk.'
  }
};

export const defaultStructureForView: Record<MarketView, StrategyStructureId> = {
  bullish: 'call-buy',
  bearish: 'put-buy',
  rangebound: 'iron-condor',
  volatile: 'long-straddle'
};

/** Alias list flattened and sorted longest-first so "iron butterfly" wins over "butterfly". */
const buildAliasIndex = (): Array<{ alias: string; id: StrategyStructureId }> =>
  (Object.entries(STRUCTURE_LIBRARY) as Array<[StrategyStructureId, StructureDefinition]>)
    .flatMap(([id, def]) => def.aliases.map((alias) => ({ alias, id })))
    .sort((a, b) => b.alias.length - a.alias.length);

let aliasIndex = buildAliasIndex();

/** Row shape of public.algo_strategy_catalog in Supabase. */
export type StrategyCatalogRow = {
  id: string;
  label: string;
  view: string;
  family: string;
  aliases: string[];
  notes: string;
  choose_when: string;
  iv_regime: string;
  risk_profile: string;
  margin_class: string;
  legs: TemplateLegSpec[];
  active?: boolean;
};

/**
 * Hydrates structures from Supabase rows: overrides label/aliases/notes/legs
 * and selection metadata for known ids. (New structure ids need code support
 * in recipes/types, so unknown ids are ignored rather than half-applied.)
 */
export const applyStrategyRows = (rows: StrategyCatalogRow[]): number => {
  let applied = 0;
  for (const row of rows) {
    const id = row?.id as StrategyStructureId;
    if (!id || !(id in STRUCTURE_LIBRARY) || row.active === false) continue;
    const definition = STRUCTURE_LIBRARY[id];
    if (row.label) definition.label = row.label;
    if (Array.isArray(row.aliases) && row.aliases.length) definition.aliases = row.aliases;
    if (row.notes) definition.notes = row.notes;
    if (['bullish', 'bearish', 'rangebound', 'volatile'].includes(row.view)) definition.view = row.view as MarketView;
    if (Array.isArray(row.legs) && row.legs.length) definition.legs = row.legs;
    const meta = STRUCTURE_META[id];
    if (row.choose_when) meta.chooseWhen = row.choose_when;
    if (['high-iv', 'low-iv', 'any'].includes(row.iv_regime)) meta.ivRegime = row.iv_regime as StructureMeta['ivRegime'];
    if (['defined', 'undefined'].includes(row.risk_profile)) meta.riskProfile = row.risk_profile as StructureMeta['riskProfile'];
    if (['low', 'medium', 'high'].includes(row.margin_class)) meta.marginClass = row.margin_class as StructureMeta['marginClass'];
    applyStructureRecipes(id, (row as { signal_recipes?: Record<string, { entry: string[]; exit: string[] }> }).signal_recipes);
    applied += 1;
  }
  aliasIndex = buildAliasIndex();
  return applied;
};

export const detectStructure = (text: string): StrategyStructureId | null => {
  const hit = aliasIndex.find(({ alias }) => text.includes(alias));
  if (!hit) return null;
  // Disambiguate bare "straddle"/"strangle": a nearby "sell"/"short"/"write" flips to the short variant.
  if ((hit.id === 'long-straddle' || hit.id === 'long-strangle') && /\b(sell|short|write)\b/.test(text)) {
    return hit.id === 'long-straddle' ? 'short-straddle' : 'short-strangle';
  }
  return hit.id;
};

/** Detect the trade setup style from chat language. */
export const detectSetup = (text: string): TradeSetup | null =>
  /\b(?:result|results|earnings|quarterly numbers|q\d\s*(?:results|numbers)|announce|announcement|event\s*(?:play|day|risk)?|news\s*(?:flow|event)|budget|rbi\s*policy|fed\s*(?:meet|decision)|fomc)\b/i.test(text)
    ? 'event'
    : /\b(?:revers|bounce|pull\s*back|pullback|turn\s*around|turnaround|mean\s*rever|oversold|overbought|recovery|rebound)/i.test(text)
      ? 'reversal'
      : /\b(?:break\s*out|breakout|breaks?\s+(?:above|below)|range\s+break)/i.test(text)
        ? 'breakout'
        : /\bmomentum\b/i.test(text)
          ? 'momentum'
          : null;

/**
 * Ticker/basket extraction. Basket names (Nifty IT, Nifty Bank, Nifty50 stocks)
 * expand into the indices plus liquid FnO constituents so the algo has a
 * concrete watchlist to scan for signals.
 */
const SYMBOL_BASKETS: Array<{ pattern: RegExp; symbols: string[] }> = [
  { pattern: /\bnifty\s*it\b|\bit\s+(?:stocks|index|sector|pack)\b/i, symbols: ['TCS', 'INFY', 'HCLTECH', 'WIPRO', 'TECHM', 'LTIM', 'COFORGE', 'MPHASIS'] },
  { pattern: /\b(?:nifty\s*bank|bank\s*nifty|banknifty|banking\s+(?:stocks|sector|pack))\b/i, symbols: ['BANKNIFTY', 'HDFCBANK', 'ICICIBANK', 'KOTAKBANK', 'SBIN', 'AXISBANK'] },
  { pattern: /\bfin\s*nifty|finnifty\b/i, symbols: ['FINNIFTY'] },
  { pattern: /\bnifty\s*50(?:\s+stocks)?\b|\bnifty50\b|\bnifty\b(?!\s*(?:it|bank|50|next))/i, symbols: ['NIFTY'] }
];

/** Well-known company names → FnO tickers (all present in the demo universe). */
const COMPANY_TICKERS: Array<{ pattern: RegExp; symbol: string }> = [
  { pattern: /\breliance\b/i, symbol: 'RELIANCE' },
  { pattern: /\btcs\b|\btata\s+consultancy\b/i, symbol: 'TCS' },
  { pattern: /\binfosys\b|\binfy\b/i, symbol: 'INFY' },
  { pattern: /\bhdfc\s*bank\b/i, symbol: 'HDFCBANK' },
  { pattern: /\bicici\s*bank\b/i, symbol: 'ICICIBANK' },
  { pattern: /\bkotak\b/i, symbol: 'KOTAKBANK' },
  { pattern: /\bsbi\b|\bstate\s+bank\b/i, symbol: 'SBIN' },
  { pattern: /\baxis\s*bank\b/i, symbol: 'AXISBANK' },
  { pattern: /\btata\s*motors\b/i, symbol: 'TATAMOTORS' },
  { pattern: /\btata\s*steel\b/i, symbol: 'TATASTEEL' },
  { pattern: /\bwipro\b/i, symbol: 'WIPRO' },
  { pattern: /\bhcl\b/i, symbol: 'HCLTECH' },
  { pattern: /\bitc\b/i, symbol: 'ITC' },
  { pattern: /\bl&t\b|\blarsen\b/i, symbol: 'LT' },
  { pattern: /\badani\s*ent\b|\badani\s*enterprises\b/i, symbol: 'ADANIENT' },
  { pattern: /\bmaruti\b/i, symbol: 'MARUTI' },
  { pattern: /\bbajaj\s*finance\b/i, symbol: 'BAJFINANCE' },
  { pattern: /\bbharti\b|\bairtel\b/i, symbol: 'BHARTIARTL' }
];

export const extractTrackedSymbols = (text: string): string[] => {
  const out: string[] = [];
  for (const basket of SYMBOL_BASKETS) {
    if (basket.pattern.test(text)) {
      for (const symbol of basket.symbols) if (!out.includes(symbol)) out.push(symbol);
    }
  }
  for (const company of COMPANY_TICKERS) {
    if (company.pattern.test(text) && !out.includes(company.symbol)) out.push(company.symbol);
  }
  return out;
};

/** Extract explicit strike levels from chat, e.g. "sell OTM 1 strikes, wings at OTM 3". */
export const extractStrikeLevels = (text: string): { shortLevel: StrikeLevel | null; wingLevel: StrikeLevel | null } => {
  const normalize = (side: string, n: string): StrikeLevel | null => {
    const label = `${side.toUpperCase()} ${n}` as StrikeLevel;
    return STRIKE_LEVELS.includes(label) ? label : null;
  };
  const wingMatch = text.match(/(?:wing|hedge|protection)s?[^.]{0,24}?\b(itm|otm)\s*(\d)/i) ?? text.match(/\b(itm|otm)\s*(\d)\b[^.]{0,16}?wings?/i);
  const wingLevel = wingMatch ? normalize(wingMatch[1], wingMatch[2]) : null;
  const withoutWing = wingMatch ? text.replace(wingMatch[0], ' ') : text;
  const atmShort = /\b(?:sell|short|body|write)[^.]{0,24}\batm\b/i.test(withoutWing) || /\batm\b[^.]{0,16}\b(?:sell|short|straddle)/i.test(withoutWing);
  const shortMatch = withoutWing.match(/\b(itm|otm)\s*(\d)\b/i);
  const shortLevel = shortMatch ? normalize(shortMatch[1], shortMatch[2]) : atmShort ? 'ATM' : null;
  return { shortLevel, wingLevel };
};

/** Human-readable one-liner for a template leg (handles futures and far-expiry legs). */
export const describeLeg = (spec: TemplateLegSpec): string =>
  `${spec.side} ${spec.instrument === 'Future' ? 'FUT' : `${spec.optionType} ${spec.strikeOffset}`}` +
  `${spec.lotsMultiplier > 1 ? ` ×${spec.lotsMultiplier}` : ''}${spec.expiryOffset === 'far' ? ' (next expiry)' : ''}`;

/** Apply chat-provided levels onto a structure's template legs. */
export const applyStrikeLevels = (
  legs: TemplateLegSpec[],
  shortLevel: StrikeLevel | null,
  wingLevel: StrikeLevel | null
): TemplateLegSpec[] =>
  legs.map((spec) => {
    if (shortLevel && (spec.role === 'body' || spec.role === 'directional')) return { ...spec, strikeOffset: shortLevel };
    if (wingLevel && (spec.role === 'wing' || spec.role === 'hedge')) return { ...spec, strikeOffset: wingLevel };
    return spec;
  });

let ruleSeq = 0;
const rule = (
  connector: RuleConnector,
  negate: boolean,
  left: string,
  operator: string,
  right: string
): AlgoRule => ({ id: `rule-${(ruleSeq += 1)}`, connector, negate, left, operator, right });

export type RuleContext = {
  support: string;
  resistance: string;
  timeStop: string;
};

/**
 * Template entry/exit rule groups per structure family + setup.
 * Composed from the signal catalog via recipes: the agent (local planner or
 * n8n LLM) always selects preset catalog signals, never invents rule inputs.
 * Entries are AND-joined gates; exits are OR-joined triggers; NOT expresses
 * avoid-conditions.
 */
export const buildTemplateRules = (structureId: StrategyStructureId, ctx: RuleContext, setup: TradeSetup | null = null): { entry: AlgoRule[]; exit: AlgoRule[] } => {
  const definition = STRUCTURE_LIBRARY[structureId];
  const recipe = recipeFor(definition.family, definition.view, setup, structureId);
  const resolve = (connector: RuleConnector) => (id: string): AlgoRule | null => {
    const resolved = resolveSignalRule(id, ctx);
    return resolved ? rule(connector, resolved.negate, resolved.left, resolved.operator, resolved.right) : null;
  };
  return {
    entry: recipe.entry.map(resolve('AND')).filter((item): item is AlgoRule => !!item),
    exit: recipe.exit.map(resolve('OR')).filter((item): item is AlgoRule => !!item)
  };
};

/**
 * Best-effort extraction of user-authored rules from chat, honouring
 * "and" / "or" connectors and negations ("not", "avoid", "unless", "skip").
 * Returns [] when nothing parseable is found so template rules apply.
 */
export const parseRulesFromText = (text: string, kind: 'entry' | 'exit'): AlgoRule[] => {
  const marker = kind === 'entry'
    ? /(?:enter|entry|buy|go long|take the trade)\s+(?:only\s+)?(?:when|if|once)\s+([^.;]+)/i
    : /(?:exit|close|square\s*off|book)\s+(?:the\s+trade\s+)?(?:when|if|once)\s+([^.;]+)/i;
  const match = text.match(marker);
  if (!match) return [];

  // Stop the captured clause at the opposite marker so "enter when X, exit when Y"
  // does not leak exit clauses into the entry group (and vice versa).
  const stopAt = kind === 'entry'
    ? /[,;]?\s*(?:then\s+)?(?:exit|close|square\s*off|book)\b.*$/i
    : /[,;]?\s*(?:then\s+)?(?:enter|entry|buy|go long|take the trade)\b.*$/i;
  const clauseText = match[1].replace(stopAt, '');

  const clauses = clauseText.split(/\b(and|or)\b/i);
  const rules: AlgoRule[] = [];
  let connector: RuleConnector = kind === 'entry' ? 'AND' : 'OR';
  for (const partRaw of clauses) {
    const part = partRaw.trim();
    if (!part) continue;
    if (/^and$/i.test(part)) { connector = 'AND'; continue; }
    if (/^or$/i.test(part)) { connector = 'OR'; continue; }
    const parsed = parseClause(part, connector);
    if (parsed) rules.push(parsed);
  }
  return rules;
};

const parseClause = (clause: string, connector: RuleConnector): AlgoRule | null => {
  const negate = /\b(?:not|avoid|unless|skip|except)\b/i.test(clause);
  const body = clause.replace(/\b(?:do\s+not|don't|not|avoid|unless|skip|except)\b/gi, ' ');

  const fields: Array<{ pattern: RegExp; left: string }> = [
    { pattern: /\brsi\b/i, left: 'rsi' },
    { pattern: /\biv\s*rank\b/i, left: 'IV Rank' },
    { pattern: /\bvolume\b/i, left: 'Current Volume' },
    { pattern: /\b(?:open interest|oi)\b/i, left: 'Current Open Interest' },
    { pattern: /\b(?:time|clock)\b/i, left: 'Time Of Day' },
    { pattern: /\b(?:expiry day|dte|days to expir)/i, left: 'Days To Expire' },
    // Price before vwap/sma so "price crosses below vwap" puts vwap on the right side.
    { pattern: /\b(?:price|close|spot|market)\b/i, left: 'Current Close' },
    { pattern: /\bvwap\b/i, left: 'vwap' },
    { pattern: /\badx\b/i, left: 'adx' },
    { pattern: /\b(?:sma|moving average)\b/i, left: 'sma' }
  ];
  const field = fields.find(({ pattern }) => pattern.test(body));
  if (!field) return null;

  // "on expiry day" / "avoid expiry day" style clauses carry no operator or number.
  if (field.left === 'Days To Expire' && !/\d/.test(body)) {
    return { id: `rule-${(ruleSeq += 1)}`, connector, negate, left: 'Days To Expire', operator: 'Equal To', right: '0' };
  }

  const operator = /crosses?\s+above|breaks?\s+above|breaks?\s*out/i.test(body)
    ? 'Crosses Above'
    : /crosses?\s+below|breaks?\s+below|breaks?\s*down/i.test(body)
      ? 'Crosses Below'
      : /\b(?:above|over|greater|more than|exceeds|after)\b/i.test(body)
        ? 'Is Above'
        : /\b(?:below|under|less than|before)\b/i.test(body)
          ? 'Is Below'
          : /\b(?:is|equals?|at)\b/i.test(body)
            ? 'Equal To'
            : null;
  if (!operator) return null;

  const timeMatch = body.match(/(\d{1,2}[:.]\d{2})/);
  const numberMatch = body.match(/(\d[\d,]*(?:\.\d+)?)/);
  const right = field.left === 'Time Of Day' && timeMatch
    ? timeMatch[1].replace('.', ':')
    : /\bvwap\b/i.test(body) && field.left !== 'vwap'
      ? 'vwap'
      : /\b(?:sma|moving average)\b/i.test(body) && field.left !== 'sma'
        ? 'sma'
        : numberMatch
          ? numberMatch[1].replace(/,/g, '')
          : null;
  if (!right) return null;

  return {
    id: `rule-${(ruleSeq += 1)}`,
    connector,
    negate,
    left: field.left,
    operator: field.left === 'Time Of Day' && operator === 'Is Above' ? 'Equal Or Above' : operator,
    right
  };
};

/** Human-readable rendering of a rule group: "A AND NOT B OR C". */
export const describeRules = (rules: AlgoRule[]): string[] =>
  rules.map((item, index) => {
    const prefix = index === 0 ? '' : `${item.connector} `;
    const negation = item.negate ? 'NOT ' : '';
    return `${prefix}${negation}${item.left} ${item.operator} ${item.right}`;
  });

export type PlanInputs = {
  structureId: StrategyStructureId;
  userText: string;
  shortLevel: StrikeLevel | null;
  wingLevel: StrikeLevel | null;
  support: string;
  resistance: string;
  timeStop?: string;
  setup?: TradeSetup | null;
  trackedSymbols?: string[];
};

export const buildAlgoPlan = (inputs: PlanInputs): AlgoPlan => {
  const definition = STRUCTURE_LIBRARY[inputs.structureId];
  const setup = inputs.setup ?? null;
  const templates = buildTemplateRules(inputs.structureId, {
    support: inputs.support,
    resistance: inputs.resistance,
    timeStop: inputs.timeStop ?? '15:10'
  }, setup);
  const userEntry = parseRulesFromText(inputs.userText, 'entry');
  const userExit = parseRulesFromText(inputs.userText, 'exit');
  // Event plays are positional (held through the announcement), so no
  // intraday time stop is forced onto user-authored exits.
  const exitRules = userExit.length
    ? (setup === 'event' ? userExit : ensureTimeStop(userExit, inputs.timeStop ?? '15:10'))
    : templates.exit;

  return {
    structureId: inputs.structureId,
    structureLabel:
      setup === 'reversal'
        ? definition.label.replace('Momentum', 'Reversal')
        : setup === 'event'
          ? `Event ${definition.label}`
          : definition.label,
    view: definition.view,
    setup,
    trackedSymbols: inputs.trackedSymbols ?? [],
    legs: applyStrikeLevels(definition.legs, inputs.shortLevel, inputs.wingLevel),
    entryConditions: userEntry.length ? userEntry : templates.entry,
    exitConditions: exitRules
  };
};

const ensureTimeStop = (rules: AlgoRule[], timeStop: string): AlgoRule[] =>
  rules.some((item) => item.left === 'Time Of Day')
    ? rules
    : [...rules, { id: `rule-${(ruleSeq += 1)}`, connector: 'OR', negate: false, left: 'Time Of Day', operator: 'Equal Or Above', right: timeStop }];
