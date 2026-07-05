import { CandidateTrade, ChatMessage, ExtractedAlgoParams, MarketOverview, MarketView, StrategyDraft, UserMode } from '../types';
import { summarizeTrade } from './calculations';
import { findUnsupportedInputs } from './signalCatalog';
import { STRUCTURE_LIBRARY, buildAlgoPlan, defaultStructureForView, describeLeg, describeRules, detectSetup, detectStructure, extractStrikeLevels, extractTrackedSymbols } from './strategyTemplates';

const lower = (value: string) => value.toLowerCase();

const includesAny = (text: string, terms: string[]) => terms.some((term) => text.includes(term));

const INDEX_SYMBOLS = ['NIFTY', 'BANKNIFTY', 'FINNIFTY', 'MIDCPNIFTY', 'NIFTYNXT50', 'SENSEX', 'BANKEX'];

export const isIndexSymbol = (symbol: string) => INDEX_SYMBOLS.includes(symbol.toUpperCase());

const firstMatch = (text: string, patterns: RegExp[]): RegExpMatchArray | null => {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) return match;
  }
  return null;
};

const parseRupees = (raw: string, scale?: string): number | null => {
  const value = Number(raw.replace(/,/g, ''));
  if (!Number.isFinite(value)) return null;
  if (scale === 'k' || scale === 'thousand') return value * 1000;
  if (scale === 'lakh' || scale === 'lac') return value * 100000;
  // A bare number under 100 is more likely a percentage or lot count than rupees.
  return value < 100 ? null : value;
};

const detectView = (text: string): MarketView | null =>
  includesAny(text, ['iron condor', 'condor', 'rangebound', 'range-bound', 'range bound', 'sideways', 'non-directional', 'theta play', ' range'])
    ? 'rangebound'
    : includesAny(text, ['straddle', 'strangle', 'volatile', 'volatility', 'big move', 'expected to move', 'sharp move', 'either side', 'event play', 'volatility play', 'vol expansion'])
      ? 'volatile'
      : includesAny(text, ['bullish', 'upside', 'buy call', 'long call', 'breakout', 'breaks out', 'bull '])
        ? 'bullish'
        : includesAny(text, ['bearish', 'downside', 'buy put', 'long put', 'breakdown', 'breaks down', 'bear '])
          ? 'bearish'
          : null;

export const extractAlgoParams = (text: string): ExtractedAlgoParams => {
  const lossMatch = firstMatch(text, [
    /(?:max(?:imum)?\s*loss|risk|lose|capital)[^\d%]{0,24}(?:₹|rs\.?|inr)?\s*([\d,]+(?:\.\d+)?)\s*(k|thousand|lakh|lac)?(?!\s*%)/,
    /(?:₹|rs\.?|inr)\s*([\d,]+(?:\.\d+)?)\s*(k|thousand|lakh|lac)?(?!\s*%)/,
    /([\d,]+(?:\.\d+)?)\s*(k|thousand|lakh|lac)?\s*rupees/
  ]);

  const slMatch = firstMatch(text, [
    /(\d{1,2}(?:\.\d+)?)\s*%[^.%\d]{0,16}?(?:stop|sl\b)/,
    /(?:stop\s*loss|stop|sl)\b[^\d%]{0,12}(\d{1,2}(?:\.\d+)?)\s*%/
  ]);

  const tpMatch = firstMatch(text, [
    /(\d{1,3}(?:\.\d+)?)\s*%\s*(?:of\s*max\s*)?(?:profit|target|tp\b)/,
    /(?:take\s*profit|profit|target|tp)\b[^\d%]{0,12}(\d{1,3}(?:\.\d+)?)\s*%/
  ]);

  const backtestMatch = firstMatch(text, [
    /backtest[^\d]{0,30}(\d+)\s*(day|week|month|year)/,
    /(\d+)\s*(day|week|month|year)s?[^.]{0,16}backtest/
  ]);
  const toMonths = (value: number, unit: string) =>
    unit.startsWith('year') ? value * 12 : unit.startsWith('month') ? value : unit.startsWith('week') ? Math.max(1, Math.round(value / 4)) : Math.max(1, Math.round(value / 30));

  const lotsMatch = text.match(/(\d+)\s*lots?\b/);
  const structure = detectStructure(text);
  const setup = detectSetup(text);
  const { shortLevel, wingLevel } = extractStrikeLevels(text);
  const detectedView = structure ? STRUCTURE_LIBRARY[structure].view : detectView(text);

  return {
    // Setups without an explicit direction get sensible defaults: reversal
    // buys the bounce, momentum rides strength (both bullish), event goes
    // long volatility. The builder makes flipping any of these a one-click edit.
    view: detectedView ?? (setup === 'reversal' || setup === 'momentum' ? 'bullish' : setup === 'event' ? 'volatile' : null),
    setup,
    trackedSymbols: extractTrackedSymbols(text),
    structure,
    shortStrikeLevel: shortLevel,
    wingStrikeLevel: wingLevel,
    maxLossRupees: lossMatch ? parseRupees(lossMatch[1], lossMatch[2]) : null,
    stopLossPct: slMatch ? Number(slMatch[1]) : null,
    takeProfitPct: tpMatch ? Number(tpMatch[1]) : null,
    backtestMonths: backtestMatch ? toMonths(Number(backtestMatch[1]), backtestMatch[2]) : null,
    lots: lotsMatch ? Number(lotsMatch[1]) : null,
    expiryPreference: /\bweekly\b/.test(text) ? 'Current Week' : /\bmonthly\b/.test(text) ? 'Current Month' : null
  };
};

export const algoStructureNames: Record<MarketView, string> = {
  bullish: 'Momentum Call Buy',
  bearish: 'Momentum Put Buy',
  rangebound: 'Iron Condor',
  volatile: 'Long Straddle'
};

export const buildWorkflowSteps = (mode: UserMode, ready: boolean) => [
  {
    label: 'Intent routing',
    state: 'completed' as const,
    detail:
      mode === 'create-trade'
        ? 'Detected one-off trade creation flow.'
        : mode === 'create-strategy'
          ? 'Detected reusable algo strategy creation flow.'
          : mode === 'screener'
            ? 'Detected option screener creation flow.'
            : 'Detected contextual education flow.'
  },
  {
    label: 'Market context',
    state: 'completed' as const,
    detail: 'Loaded option chain, OI walls, volatility regime, liquidity, and stale-data flags.'
  },
  {
    label: 'Clarification',
    state: ready ? ('completed' as const) : ('waiting_input' as const),
    detail: ready
      ? 'Enough inputs captured to draft an artifact.'
      : mode === 'create-strategy'
        ? 'Waiting for your market view: bullish, bearish, rangebound, or volatile. Everything else uses editable defaults.'
        : 'Waiting for risk, direction, expiry, or exit preference.'
  },
  {
    label: 'Artifact validation',
    state: ready ? ('completed' as const) : ('queued' as const),
    detail: ready ? 'Max loss, liquidity, and quality flags checked.' : 'Will run after missing inputs are resolved.'
  }
];

export const createInitialMessages = (): ChatMessage[] => [
  {
    id: 'welcome',
    role: 'assistant',
    createdAt: new Date().toISOString(),
    text:
      "Tell me whether you want a one-off trade or a reusable algo strategy. For an algo, just share your market view (bullish, bearish, rangebound, or volatile) plus any numbers you care about — e.g. 'rangebound NIFTY, max loss 5000, exit at 50% profit'. I default everything else and you can edit the result in the builder."
  }
];

export const draftFromChat = (
  mode: UserMode,
  messages: ChatMessage[],
  topTrades: CandidateTrade[],
  overview: MarketOverview
): StrategyDraft => {
  const userText = lower(messages.filter((m) => m.role === 'user').map((m) => m.text).join(' '));
  const hasRisk = includesAny(userText, ['risk', 'loss', 'capital', 'max loss', 'stop']);
  const hasDirection = includesAny(userText, ['bullish', 'bearish', 'range', 'sideways', 'volatile', 'breakout', 'hedge']);
  const hasExit = includesAny(userText, ['exit', 'target', 'stop', 'time', 'expiry', 'profit']);
  const hasFilter = includesAny(userText, ['liquid', 'liquidity', 'spread', 'event', 'volatility', 'oi', 'volume']);
  const selectedTrade =
    includesAny(userText, ['iron condor', 'range', 'sideways'])
      ? topTrades.find((t) => t.strategy === 'Iron Condor') ?? topTrades[0]
      : includesAny(userText, ['bullish', 'upside'])
        ? topTrades.find((t) => t.direction === 'bullish') ?? topTrades[0]
        : includesAny(userText, ['bearish', 'downside', 'hedge'])
          ? topTrades.find((t) => t.direction === 'bearish') ?? topTrades[0]
          : topTrades[0];

  if (!selectedTrade) {
    return {
      title: 'Market Data Required',
      mode,
      status: 'needs-input',
      missingInputs: ['Fresh option-chain snapshot'],
      filters: ['Wait for market data before creating artifacts'],
      entryRules: ['No entry can be evaluated without a valid chain'],
      exitRules: ['No exit can be evaluated without a valid chain'],
      riskRules: ['No simulated trade without max loss and quality flags']
    };
  }

  const missingInputs = [
    !hasDirection ? 'Directional or volatility view' : null,
    !hasRisk ? 'Maximum acceptable loss or capital at risk' : null,
    !hasExit ? 'Exit rule: profit target, stop, time stop, or expiry behavior' : null,
    !hasFilter ? 'Filters: liquidity, spread, event, and volatility constraints' : null
  ].filter((item): item is string => !!item);

  if (mode === 'ask-ai') {
    return {
      title: 'Contextual Options Explanation',
      mode,
      status: 'ready',
      missingInputs: [],
      filters: ['Use current screen context', `Selected instrument: ${overview.instrument.symbol}`, 'Educational explanation only'],
      entryRules: ['Explain the metric, why it matters, and what can invalidate it'],
      exitRules: ['Offer next action: inspect chain, create trade, build screener, or create algo'],
      riskRules: ['Do not present explanations as advice', 'Show data freshness and assumptions'],
      selectedTrade
    };
  }

  if (mode === 'screener') {
    const screenerMissing = [
      !includesAny(userText, ['delta', 'iv', 'oi', 'volume', 'spread', 'liquid', 'rsi', 'adx', 'price']) ? 'At least one filter: delta, IV, OI, volume, spread, liquidity, or technicals' : null,
      !includesAny(userText, ['call', 'put', 'ce', 'pe', 'stock', 'index', 'all']) ? 'Instrument universe and option type' : null
    ].filter((item): item is string => !!item);
    return {
      title: screenerMissing.length ? 'Draft Option Screener' : 'Liquid Options Screener',
      mode,
      status: screenerMissing.length ? 'needs-input' : 'ready',
      missingInputs: screenerMissing,
      filters: [
        'Universe: liquid index and stock FnO contracts',
        'Spread filter: bid-ask below 2-5% depending on premium',
        'Rank by liquidity, OI change, and strategy fit'
      ],
      entryRules: ['Run query on the latest demo snapshot', 'Promote matching row into Analyse Trade for payoff inspection'],
      exitRules: ['Save query after reviewing false positives', 'Use alerts only after live data is connected'],
      riskRules: ['Screeners discover candidates; they do not validate trade risk by themselves'],
      selectedTrade
    };
  }

  if (mode === 'create-strategy') {
    const params = extractAlgoParams(userText);
    const symbol = overview.instrument.symbol;
    const expiryWord = (params.expiryPreference ?? (isIndexSymbol(symbol) ? 'Current Week' : 'Current Month')) === 'Current Week' ? 'Weekly' : 'Monthly';
    const structureId = params.structure ?? (params.view ? defaultStructureForView[params.view] : null);
    const ready = structureId !== null;
    const slPct = params.stopLossPct ?? 35;
    const tpPct = params.takeProfitPct ?? 60;
    const maxLoss = params.maxLossRupees ?? 5000;
    const appliedDefaults = [
      params.stopLossPct == null ? `stop loss ${slPct}%` : null,
      params.takeProfitPct == null ? `take profit ${tpPct}%` : null,
      params.maxLossRupees == null ? `daily max loss ₹${maxLoss.toLocaleString('en-IN')}` : null,
      params.backtestMonths == null ? 'backtest period 3 months' : null,
      params.lots == null ? '1 lot per leg' : null
    ].filter((item): item is string => !!item);
    const trackedSymbols = params.trackedSymbols.length ? params.trackedSymbols : [symbol];
    const plan = structureId
      ? buildAlgoPlan({
          structureId,
          userText,
          shortLevel: params.shortStrikeLevel,
          wingLevel: params.wingStrikeLevel,
          support: String(overview.chain.putWall || Math.round(overview.instrument.spot * 0.994)),
          resistance: String(overview.chain.callWall || Math.round(overview.instrument.spot * 1.006)),
          setup: params.setup,
          trackedSymbols
        })
      : undefined;
    const legSummaries = plan ? plan.legs.map(describeLeg) : [];
    return {
      title: plan
        ? `${params.trackedSymbols.length > 1 ? 'Multi-Symbol' : symbol} ${expiryWord} ${plan.structureLabel}`
        : 'Draft Algo Strategy',
      mode,
      status: ready ? 'ready' : 'needs-input',
      missingInputs: ready
        ? []
        : ['Your market view (bullish, bearish, rangebound, volatile) or a structure (iron condor, iron butterfly, butterfly spread, short strangle, straddle, bull call spread...)'],
      filters: [
        params.trackedSymbols.length
          ? `Tracked symbols (signal watchlist): ${trackedSymbols.join(', ')}`
          : `Instrument universe: ${symbol} options only in MVP`,
        ...(plan?.setup ? [`Setup: ${plan.setup} — entry template tuned for ${plan.setup} signals`] : []),
        ...(plan ? [`Structure: ${plan.structureLabel} — legs: ${legSummaries.join(' · ')}`] : []),
        'Default: liquidity score above 70, tight bid-ask spread, no critical stale-data flags',
        ...(appliedDefaults.length ? [`Defaults you can edit in the builder: ${appliedDefaults.join(', ')}`] : [])
      ],
      entryRules: plan
        ? describeRules(plan.entryConditions)
        : ['Entry rules are generated as individual AND/OR/NOT conditions once the structure or view is known'],
      exitRules: plan
        ? describeRules(plan.exitConditions)
        : [
            `Take profit at ${tpPct}% and stop at ${slPct}% per transaction`,
            'Time exit at 15:10 for intraday runs'
          ],
      riskRules: [
        `Per-leg SL ${slPct}% / TP ${tpPct}% on risk-bearing legs; daily max loss ₹${maxLoss.toLocaleString('en-IN')}`,
        `Validation: backtest ${params.backtestMonths ?? 3} month${(params.backtestMonths ?? 3) > 1 ? 's' : ''} before paper trading`,
        'No averaging down and no live broker order placement'
      ],
      selectedTrade,
      params,
      plan,
      unsupportedInputs: findUnsupportedInputs(userText)
    };
  }

  return {
    title: missingInputs.length ? 'Draft Trade Artifact' : selectedTrade.title,
    mode,
    status: missingInputs.length ? 'needs-input' : 'ready',
    missingInputs,
    filters: [
      'Defined-risk structure only',
      'Reject critical stale quote, missing bid-ask, or very wide spread',
      'Prefer high OI strikes near visible support/resistance walls'
    ],
    entryRules: [
      `Candidate: ${summarizeTrade(selectedTrade)}`,
      'Paper entry at mid price plus configured slippage',
      'Enter only while score remains above 70'
    ],
    exitRules: [
      'Take profit at 50% of max profit or at strategy-specific target',
      'Stop at 35% of max loss',
      'Close before expiry if expected move is breached against the trade'
    ],
    riskRules: [
      'Show max loss before paper-trade creation',
      'Keep all recommendations educational and simulated',
      'Persist score breakdown and assumptions with the artifact'
    ],
    selectedTrade
  };
};

export const assistantReply = (draft: StrategyDraft) => {
  if (draft.mode === 'create-strategy') {
    if (draft.status === 'needs-input') {
      const unsupportedNote = draft.unsupportedInputs?.length ? `${draft.unsupportedInputs.join(' ')} ` : '';
      return `${unsupportedNote}What's your view on the market — do you expect it to go up, go down, stay in a range, or make a big move? You can also name a strategy directly (iron condor, straddle, bull call spread...). Add any numbers you care about (max loss, stop %, target %, lots, backtest period) and I'll handle the rest with sensible defaults you can edit.`;
    }
    const params = draft.params;
    const captured = [
      params?.trackedSymbols.length ? `watchlist ${params.trackedSymbols.join(', ')}` : null,
      params?.setup != null ? `${params.setup} setup` : null,
      params?.structure != null ? `structure ${draft.plan?.structureLabel ?? params.structure}` : null,
      params?.shortStrikeLevel != null ? `short strikes at ${params.shortStrikeLevel}` : null,
      params?.wingStrikeLevel != null ? `wings at ${params.wingStrikeLevel}` : null,
      params?.maxLossRupees != null ? `max loss ₹${params.maxLossRupees.toLocaleString('en-IN')}` : null,
      params?.stopLossPct != null ? `stop ${params.stopLossPct}%` : null,
      params?.takeProfitPct != null ? `target ${params.takeProfitPct}%` : null,
      params?.lots != null ? `${params.lots} lot${params.lots > 1 ? 's' : ''}` : null,
      params?.backtestMonths != null ? `backtest ${params.backtestMonths} month${params.backtestMonths > 1 ? 's' : ''}` : null
    ].filter((item): item is string => !!item);
    const legLine = draft.plan
      ? ` Legs: ${draft.plan.legs.map(describeLeg).join(', ')}. Entry and exit are individual rules joined with AND/OR/NOT — edit each one in the builder.`
      : '';
    const unsupportedLine = draft.unsupportedInputs?.length
      ? ` One heads-up: ${draft.unsupportedInputs.join(' ')}`
      : '';
    return `Drafted "${draft.title}".${captured.length ? ` Captured from chat: ${captured.join(', ')}.` : ''}${legLine}${unsupportedLine} Anything you did not specify uses editable defaults — press Apply AI Draft to fill the builder.`;
  }

  if (draft.status === 'needs-input') {
    return `I can draft this, but I need ${draft.missingInputs.slice(0, 3).join(', ')}. Give me those and I will turn it into a validated ${draft.mode === 'create-trade' ? 'trade' : draft.mode === 'screener' ? 'screener' : 'algo strategy'} artifact.`;
  }

  if (draft.mode === 'ask-ai') {
    return `Here is the simple read: ${draft.entryRules[0]}. On this screen I would connect the explanation to the selected instrument, visible risk flags, and the next action you can take.`;
  }

  if (draft.mode === 'screener') {
    return draft.status === 'ready'
      ? 'I can turn that into a screener now: liquidity, IV/OI filters, technical confirmation, and a result table that can promote rows into Analyse Trade.'
      : `I can create the screener, but I need ${draft.missingInputs.slice(0, 2).join(', ')}.`;
  }

  if (draft.mode === 'create-trade' && draft.selectedTrade) {
    return `I have a complete trade artifact: ${summarizeTrade(draft.selectedTrade)} I would paper trade it only after the liquidity and freshness checks remain green.`;
  }

  return 'I have enough inputs to compile this into a reusable algo strategy with filters, entry rules, exit rules, risk rules, and a backtest plan.';
};
