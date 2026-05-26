export type OptionType = 'CE' | 'PE';
export type TradeSide = 'BUY' | 'SELL';
export type UserMode = 'ask-ai' | 'create-trade' | 'create-strategy' | 'screener';

export type Instrument = {
  symbol: string;
  name: string;
  lotSize: number;
  minimumLot: number;
  tickSize: number;
  freezeQuantity: number;
  expiry: string;
  isWeekly: boolean;
  spot: number;
  previousClose: number;
  snapshotTs: string;
};

export type OptionQuote = {
  strike: number;
  type: OptionType;
  bid: number;
  bidQuantity: number;
  ask: number;
  askQuantity: number;
  ltp: number;
  volume: number;
  oi: number;
  oiChange: number;
  totalBuyQuantity: number;
  totalSellQuantity: number;
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
};

export type WorkflowStep = {
  label: string;
  state: 'queued' | 'running' | 'waiting_input' | 'completed' | 'failed';
  detail: string;
};
