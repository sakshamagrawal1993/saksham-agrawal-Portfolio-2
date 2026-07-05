export type OptionType = 'CE' | 'PE';
export type TradeSide = 'BUY' | 'SELL';
export type UserMode = 'ask-ai' | 'create-trade' | 'create-strategy' | 'screener';

export type Instrument = {
  symbol: string;
  name: string;
  lotSize: number;
  // Optional: present on live/edge-adapted instruments; demo/mock data omits them
  // (edgeMarketAdapter supplies safe defaults when reading raw market data).
  minimumLot?: number;
  tickSize?: number;
  freezeQuantity?: number;
  expiry: string;
  isWeekly?: boolean;
  spot: number;
  previousClose: number;
  snapshotTs: string;
};

export type OptionQuote = {
  strike: number;
  type: OptionType;
  bid: number;
  // Optional depth fields: present on live/edge-adapted quotes; demo/mock data omits them.
  bidQuantity?: number;
  ask: number;
  askQuantity?: number;
  ltp: number;
  volume: number;
  oi: number;
  oiChange: number;
  totalBuyQuantity?: number;
  totalSellQuantity?: number;
  iv: number;
  delta: number;
  gamma: number;
  theta: number;
  vega: number;
  rho: number;
  theoreticalFairValue?: number;
  fairValueDeviation?: number;
  modelConfidence?: number;
  quoteTs: string;
};

export type OptionChainColumnGroup = 'Price' | 'OI/Volume' | 'Volatility' | 'Greeks' | 'Futures' | 'Model Edge';

export type OptionLeg = {
  id: string;
  side: TradeSide;
  type: OptionType;
  strike: number;
  expiry: string;
  quantity: number;
  premium: number;
  iv: number;
  delta: number;
  gamma: number;
  theta: number;
  vega: number;
  rho: number;
};

export type ScoreBreakdown = {
  liquidity: number;
  riskReward: number;
  regimeFit: number;
  volFit: number;
  dataConfidence: number;
  simplicity: number;
};

export type QualityFlag = {
  severity: 'info' | 'warning' | 'critical';
  code: string;
  label: string;
};

export type CandidateTrade = {
  id: string;
  title: string;
  strategy: string;
  direction: 'bullish' | 'bearish' | 'range-bound' | 'volatility' | 'hedged';
  thesis: string;
  legs: OptionLeg[];
  netPremium: number;
  maxProfit: number | null;
  maxLoss: number | null;
  breakevens: number[];
  pop: number;
  score: number;
  scoreBreakdown: ScoreBreakdown;
  qualityFlags: QualityFlag[];
  riskTags: string[];
  payoff: Array<{ spot: number; pnl: number }>;
};

export type ChainAnalytics = {
  pcrOi: number;
  pcrVolume: number;
  maxPain: number;
  callWall: number;
  putWall: number;
  expectedMoveStraddle: number;
  expectedMoveIv: number;
  atmIv: number;
  skew: number;
  termSlope: number;
  quoteAgeSec: number;
  liquidityScore: number;
  ivRank?: number;
  ivPercentile?: number;
  historicalVolatility?: number;
  volatilitySurfaceQuality?: number;
  qualityFlags: QualityFlag[];
};

export type MarketOverview = {
  instrument: Instrument;
  regime: 'bullish' | 'bearish' | 'range-bound' | 'volatile';
  trendScore: number;
  volatilityRegime: 'low' | 'normal' | 'high';
  chain: ChainAnalytics;
  futuresOi?: number;
  futuresBasis?: number;
  participantFiiDii?: {
    fiiNetLong: number;
    diiNetLong: number;
  };
  upcomingEvents?: {
    eventName: string;
    eventDate: string;
    impact: 'high' | 'medium' | 'low';
  }[];
};

export type ChatMessage = {
  id: string;
  role: 'user' | 'assistant' | 'system';
  text: string;
  createdAt: string;
};

export type MarketView = 'bullish' | 'bearish' | 'rangebound' | 'volatile';

/** How a rule joins the previous rule inside a rule group. Ignored on the first rule. */
export type RuleConnector = 'AND' | 'OR';

/**
 * One atomic entry/exit rule. A rule group is an ordered list of these:
 *   rule1 <connector2> rule2 <connector3> rule3 ...
 * `negate: true` renders/evaluates the rule as NOT (left operator right).
 */
export type AlgoRule = {
  id: string;
  connector: RuleConnector;
  negate: boolean;
  left: string;
  operator: string;
  right: string;
};

export type StrikeLevel =
  | 'ITM 5' | 'ITM 4' | 'ITM 3' | 'ITM 2' | 'ITM 1'
  | 'ATM'
  | 'OTM 1' | 'OTM 2' | 'OTM 3' | 'OTM 4' | 'OTM 5';

export type StrategyStructureId =
  | 'iron-condor'
  | 'iron-butterfly'
  | 'call-butterfly'
  | 'put-butterfly'
  | 'short-strangle'
  | 'long-strangle'
  | 'short-straddle'
  | 'long-straddle'
  | 'bull-call-spread'
  | 'bear-put-spread'
  | 'bull-put-spread'
  | 'bear-call-spread'
  | 'call-buy'
  | 'put-buy'
  | 'call-ratio-spread'
  | 'put-ratio-spread'
  | 'call-calendar'
  | 'covered-call'
  | 'protective-put'
  | 'collar'
  | 'broken-wing-butterfly'
  | 'jade-lizard';

/** A leg described at template level (strike as ITM/ATM/OTM offset, not absolute). */
export type TemplateLegSpec = {
  role: 'body' | 'wing' | 'directional' | 'hedge';
  side: 'Buy' | 'Sell';
  optionType: OptionType;
  strikeOffset: StrikeLevel;
  lotsMultiplier: number;
  /** Whether per-leg SL/TP should be attached (short/body/directional legs yes, protective wings no). */
  applyRisk: boolean;
  /** 'Future' legs (covered call, collar) ignore optionType/strikeOffset. Default 'Option'. */
  instrument?: 'Option' | 'Future';
  /** 'far' legs sit one expiry further out (calendar spreads). Default 'near'. */
  expiryOffset?: 'near' | 'far';
};

/** The full machine-readable strategy plan the chat produces for the builder. */
export type AlgoPlan = {
  structureId: StrategyStructureId;
  structureLabel: string;
  view: MarketView;
  setup: TradeSetup | null;
  /** Tickers the algo scans for signals (watchlist), e.g. indices + basket constituents. */
  trackedSymbols: string[];
  legs: TemplateLegSpec[];
  entryConditions: AlgoRule[];
  exitConditions: AlgoRule[];
};

/** Trade setup style detected from chat; shapes the entry/exit rule templates. */
export type TradeSetup = 'reversal' | 'momentum' | 'breakout' | 'event';

/** Payoff family of a structure; used to pick signal recipes from the catalog. */
export type StructureFamily = 'neutral-credit' | 'pin-debit' | 'directional-debit' | 'directional-credit' | 'volatility-debit';

export type ExtractedAlgoParams = {
  view: MarketView | null;
  setup: TradeSetup | null;
  trackedSymbols: string[];
  structure: StrategyStructureId | null;
  shortStrikeLevel: StrikeLevel | null;
  wingStrikeLevel: StrikeLevel | null;
  maxLossRupees: number | null;
  stopLossPct: number | null;
  takeProfitPct: number | null;
  backtestMonths: number | null;
  lots: number | null;
  expiryPreference: 'Current Week' | 'Current Month' | null;
};

export type StrategyDraft = {
  title: string;
  mode: UserMode;
  status: 'needs-input' | 'ready';
  missingInputs: string[];
  filters: string[];
  entryRules: string[];
  exitRules: string[];
  riskRules: string[];
  selectedTrade?: CandidateTrade;
  params?: ExtractedAlgoParams;
  plan?: AlgoPlan;
  /** Plain-language notices for inputs the platform cannot honour yet. */
  unsupportedInputs?: string[];
};

export type WorkflowStep = {
  label: string;
  state: 'queued' | 'running' | 'waiting_input' | 'completed' | 'failed';
  detail: string;
};
