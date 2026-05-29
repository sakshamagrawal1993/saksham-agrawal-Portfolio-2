import { CandidateTrade, ChatMessage, MarketOverview, StrategyDraft, UserMode } from '../types';
import { summarizeTrade } from './calculations';

const lower = (value: string) => value.toLowerCase();

const includesAny = (text: string, terms: string[]) => terms.some((term) => text.includes(term));

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
    detail: ready ? 'Enough inputs captured to draft an artifact.' : 'Waiting for risk, direction, expiry, or exit preference.'
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
      'Tell me whether you want to find a one-off options trade or create a reusable algo strategy. I will ask for missing risk, entry, exit, and filter inputs before producing a paper-trade-ready artifact.'
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
    const strategyMissing = [
      !includesAny(userText, ['entry', 'signal', 'when', 'trend', 'indicator', 'rsi', 'macd']) ? 'Entry signal definition (e.g. what defines the bullish trend?)' : null,
      !includesAny(userText, ['margin', 'capital', 'funds']) ? 'Total available margin' : null,
      !includesAny(userText, ['loss', 'risk limit', 'max loss']) ? 'Maximum acceptable loss per trade' : null
    ].filter((item): item is string => !!item);
    return {
      title: strategyMissing.length ? 'Draft Algo Strategy: Need More Info' : 'Draft Algo Strategy: Risk & Signal Approved',
      mode,
      status: [...strategyMissing].length ? 'needs-input' : 'ready',
      missingInputs: [...strategyMissing],
      filters: [
        `Instrument universe: ${overview.instrument.symbol} options only in MVP`,
        'Reject if any leg has critical stale-data or missing bid-ask flag',
        'Require liquidity score above 70 and defined max loss'
      ],
      entryRules: [
        'Enter only when market regime matches the chosen view',
        `Use OI walls: put wall ${overview.chain.putWall}, call wall ${overview.chain.callWall}`,
        'Confirm spread and OI thresholds before paper entry'
      ],
      exitRules: [
        'Exit at 50% of max profit for credit strategies',
        'Exit at 35% of max loss or when quality flags become critical',
        'Force close before expiry if event risk is detected'
      ],
      riskRules: [
        'One paper position per instrument in MVP',
        'Strict margin constraints and max loss limit applied per trade',
        'Auto-suggest spreads over naked options to cap loss if required'
      ],
      selectedTrade
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

  if (draft.mode === 'create-strategy') {
    if (draft.status === 'needs-input') {
      if (draft.missingInputs.includes('Total available margin') || draft.missingInputs.includes('Maximum acceptable loss per trade')) {
        return `Great. Before we build this, let's protect your capital. What is your **total available margin** for this strategy, and what is the **maximum loss** (in INR or %) you are willing to take per trade?`;
      }
      if (draft.missingInputs.includes('Entry signal definition (e.g. what defines the bullish trend?)')) {
        return `I can help you build a strategy. Usually, traders identify this using technical indicators like the RSI being over 60 or the MACD crossing its signal line. How would you like to define it?`;
      }
      return `I need a bit more info: ${draft.missingInputs.join(', ')}.`;
    }
    return `Understood. I have designed a risk-defined strategy and added a safety filter to ensure we only trade highly liquid strikes. I am passing the configuration to the manual builder for your review.`;
  }

  return 'I have enough inputs to compile this artifact.';
};
