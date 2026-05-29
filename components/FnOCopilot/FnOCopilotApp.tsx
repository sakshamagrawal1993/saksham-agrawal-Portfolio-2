import React from 'react';
import {
  Activity,
  ArrowLeft,
  BarChart3,
  Bot,
  BrainCircuit,
  CandlestickChart,
  ChevronRight,
  Clock3,
  Gauge,
  Layers3,
  LineChart,
  ListFilter,
  MessagesSquare,
  PlayCircle,
  Search,
  Send,
  ShieldCheck,
  Sparkles,
  Target,
  TrendingDown,
  TrendingUp,
  Zap
} from 'lucide-react';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, ComposedChart, Line, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { contractRows, dataSource, DemoContractSummary, instrumentsBySymbol, optionChainsBySymbol } from './data/excelMarket';
import {
  getUpstoxCoverageCounts,
  upstoxAnalyticsFeeds,
  upstoxDashboardCoverage,
  upstoxMissingScreenSuggestions
} from './data/upstoxAnalyticsMap';
import {
  fetchFnOCopilotBootstrap,
  initAgentSession,
  isFnOCopilotEdgeEnabled,
  sendAgentChat
} from './fnoCopilotApi';
import { assistantReply, buildWorkflowSteps, createInitialMessages, draftFromChat } from './lib/aiPlanner';
import { aggregateGreeks, computeChainAnalytics, getAtmStrike, getQuote, mid, round, rupee } from './lib/calculations';
import { parseLiveMarketBootstrap, type FnOLiveMarketState } from './lib/edgeMarketAdapter';
import { generateTopTrades } from './lib/strategyEngine';
import { CandidateTrade, ChainAnalytics, ChatMessage, Instrument, MarketOverview, OptionChainColumnGroup, OptionQuote, StrategyDraft, UserMode } from './types';
import './styles.css';

type Screen = 'dashboard' | 'contract' | 'analyse-trade' | 'create-trades' | 'algo-builder' | 'screener' | 'paper-trades';
type WorkspaceMode = 'standard' | 'agent';
type DataBackendStatus = 'local' | 'edge-online' | 'edge-error';
type DetailTab = 'overview' | 'option-chain' | 'combined-oi' | 'technicals' | 'build-up' | 'quick-trades';
type DirectionKey = 'up' | 'down' | 'rangebound' | 'volatile';
type RiskProfile = 'Defensive' | 'Neutral' | 'Aggressive';
type ContractSummary = DemoContractSummary;
type LiveMarketCache = Record<string, FnOLiveMarketState>;
type AgentHistoryItem = {
  id: string;
  mode: UserMode;
  title: string;
  preview: string;
  createdAt: string;
};

type IndicatorConfig = {
  id: string;
  type: string;
  name: string;
  chartType: string;
  interval: string;
  field: string;
  period: number;
};

type SignalCondition = {
  id: string;
  left: string;
  operator: string;
  right: string;
};

type AlgoLegConfig = {
  id: string;
  segment: 'Open' | 'Close';
  instrumentType: 'Future' | 'Option';
  expiry: 'Current Week' | 'Next Week' | 'Current Month' | 'Next Month';
  selectionBasis: string;
  strikeOffset: string;
  optionType: 'CE' | 'PE';
  lots: number;
  side: 'Buy' | 'Sell';
  stopLossType: '%' | '₹' | 'Pts' | 'Spot %' | 'Spot Pts';
  stopLossValue: string;
  takeProfitType: '%' | '₹' | 'Pts' | 'Spot %' | 'Spot Pts';
  takeProfitValue: string;
};

type AlgoStrategyConfig = {
  runMode: 'Backtest' | 'Create';
  runName: string;
  folderName: string;
  instrumentSegment: 'Equity & Index' | 'Future & Options';
  symbol: string;
  advanced: boolean;
  indicators: IndicatorConfig[];
  trailingStopLoss: boolean;
  reEntry: boolean;
  reExecute: boolean;
  parallelCases: string;
  entryConditions: SignalCondition[];
  exitConditions: SignalCondition[];
  legs: AlgoLegConfig[];
  adjustmentTiming: 'Next Minute Start' | 'Immediate' | 'Delay By';
  marginLimit: string;
  maxLossLimit: string;
  liquidityFilter: boolean;
  transactionStopLossType: '%' | '₹' | 'Pts';
  transactionStopLoss: string;
  transactionTakeProfitType: '%' | '₹' | 'Pts';
  transactionTakeProfit: string;
  dailyStopLoss: string;
  dailyTakeProfit: string;
  tradeType: 'Intraday' | 'Positional';
  startTime: string;
  endTime: string;
  maxTransactionsPerDay: number;
};

const detailTabs: Array<{ id: DetailTab; label: string; icon: React.ReactNode }> = [
  { id: 'overview', label: 'Overview', icon: <Gauge size={15} /> },
  { id: 'option-chain', label: 'Option Chain', icon: <Layers3 size={15} /> },
  { id: 'combined-oi', label: 'Combined OI', icon: <BarChart3 size={15} /> },
  { id: 'technicals', label: 'Technicals', icon: <LineChart size={15} /> },
  { id: 'build-up', label: 'Build Up', icon: <CandlestickChart size={15} /> },
  { id: 'quick-trades', label: 'Find Trades', icon: <Target size={15} /> }
];

const directions: Array<{ id: DirectionKey; label: string; summary: string }> = [
  { id: 'up', label: 'Up', summary: 'Bullish setups built around support, debit spreads, and controlled upside exposure.' },
  { id: 'down', label: 'Down', summary: 'Bearish or hedge setups that cap loss while expressing downside.' },
  { id: 'rangebound', label: 'Rangebound', summary: 'Theta-positive structures if spot stays between OI walls.' },
  { id: 'volatile', label: 'Volatile', summary: 'Convex structures for large move expectations and event risk.' }
];

const profiles: RiskProfile[] = ['Defensive', 'Neutral', 'Aggressive'];

const scoreKeys: Array<keyof CandidateTrade['scoreBreakdown']> = [
  'liquidity',
  'riskReward',
  'regimeFit',
  'volFit',
  'dataConfidence',
  'simplicity'
];

const defaultContract = contractRows.find((contract) => contract.symbol === 'NIFTY') ?? contractRows[0];
const indicatorTypes = ['bearishEngulfing', 'bearishHammer', 'bearishInvertedHammer', 'bearishMarubozu', 'bearishSpinningTop', 'bullishEngulfing', 'bullishHammer', 'bullishInvertedHammer', 'bullishMarubozu', 'bullishSpinningTop', 'darkCloudCover', 'doji', 'dragonFlyDoji', 'eveningStar', 'graveStoneDoji', 'heikinashiBearish', 'heikinashiBearishIndecision', 'heikinashiBullish', 'heikinashiBullishIndecision', 'heikinashiVeryBearish', 'heikinashiVeryBullish', 'longLeggedDoji', 'morningStar', 'piercingLine', 'renkoBearishBrick', 'renkoBullishBrick', 'threeBlackCrows', 'threeWhiteSoldiers', 'augmentedDickeyFuller', 'densityCurve', 'ratio', 'ratioStandardDeviation', 'zScore', 'anchoredVolumeWeightedAveragePrice', 'centralPivotRange', 'currentCandle', 'gapStrategy', 'lastNCandles', 'openingRangeBreakout', 'pivotPoints', 'previousCandle', 'priceCandle', 'signalCandle', 'todayCandle', 'volumeWeightedAveragePrice', 'yesterdayCandle', 'aroon', 'averageDirectionalIndex', 'averageTrueRange', 'awesomeOscillator', 'bollingerBand', 'commodityChannelIndex', 'exponentialMovingAverage', 'ichimokuCloud', 'longBuildup', 'longUnwidening', 'movingAverageConvergenceDivergence', 'rateOfChange', 'relativeStrengthIndex', 'shortBuildup', 'shortCovering', 'simpleMovingAverage', 'stochasticOscillator', 'stochasticRSI', 'superTrend', 'weightedMovingAverage', 'wilderSmoothingAverage', 'williamsR', 'williamsAlligator', 'indiaVIXPercentile'];
const signalFields = ['Current Close', 'Current Open', 'Current High', 'Current Low', 'Volume', 'Open Interest', 'VWAP', 'SMA', 'EMA', 'WMA', 'RSI', 'MACD', 'Bollinger Bands', 'Supertrend', 'ATR', 'Time of Day', 'Day of Week', 'Number'];
const signalOperators = ['Crosses Above', 'Crosses Below', 'Greater Than', 'Less Than', 'Equal To', 'Higher Than Previous', 'Lower Than Previous'];
const strikeOffsets = ['-30', '-29', '-28', '-27', '-26', '-25', '-24', '-23', '-22', '-21', '-20', '-19', '-18', '-17', '-16', '-15', '-14', '-13', '-12', '-11', '-10', '-9', '-8', '-7', '-6', '-5', '-4', '-3', '-2', '-1', '0 (ATM)', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12', '13', '14', '15', '16', '17', '18', '19', '20', '21', '22', '23', '24', '25', '26', '27', '28', '29', '30'];
const expiryChoices: AlgoLegConfig['expiry'][] = ['Current Week', 'Next Week', 'Current Month', 'Next Month'];
const selectionBasisChoices = ['Spot Based', 'Future Based', 'Strike Price', 'Premium near', 'Premium greater', 'Premium lesser', 'Indicator Based', 'Delta near', 'Delta greater', 'Delta lesser', 'Outside Expected Move'];
const optionChainGroups: OptionChainColumnGroup[] = ['Price', 'OI/Volume', 'Volatility', 'Greeks', 'Futures', 'Model Edge'];
const agentModeLabels: Record<UserMode, string> = {
  'ask-ai': 'Ask AI',
  'create-trade': 'Create Trades',
  'create-strategy': 'Create Algo',
  screener: 'Option Screener'
};
const starterChatHistory: AgentHistoryItem[] = [
  {
    id: 'starter-range',
    mode: 'create-trade',
    title: 'Range trade around OI walls',
    preview: 'Compared iron condor and iron fly using PCR, IV, and max loss.',
    createdAt: 'Earlier'
  },
  {
    id: 'starter-scan',
    mode: 'screener',
    title: 'Liquid high-IV option scan',
    preview: 'Screened ATM and near-OTM contracts with strong OI participation.',
    createdAt: 'Earlier'
  },
  {
    id: 'starter-question',
    mode: 'ask-ai',
    title: 'Why does max pain matter?',
    preview: 'Explained max pain as expiry positioning context, not a signal by itself.',
    createdAt: 'Earlier'
  }
];

function createDefaultAlgoConfig(contract: ContractSummary): AlgoStrategyConfig {
  return {
    runMode: 'Create',
    runName: `${contract.symbol} Range Algo`,
    folderName: 'FnO Co-Pilot',
    instrumentSegment: 'Future & Options',
    symbol: contract.symbol,
    advanced: true,
    indicators: [
      { id: 'current', type: 'Current Candle', name: 'Current', chartType: 'Candle', interval: '5 Minutes', field: 'Future', period: 1 },
      { id: 'sma-9', type: 'simpleMovingAverage', name: 'sma', chartType: 'Candle', interval: '5 Minutes', field: 'Future', period: 9 }
    ],
    trailingStopLoss: false,
    reEntry: false,
    reExecute: false,
    parallelCases: 'Case 1',
    entryConditions: [
      { id: 'entry-1', left: 'Current Close', operator: 'Crosses Above', right: 'sma' },
      { id: 'entry-2', left: 'Current Volume', operator: 'Is Above', right: '20 period average' }
    ],
    exitConditions: [
      { id: 'exit-1', left: 'Current Close', operator: 'Crosses Below', right: 'sma' },
      { id: 'exit-2', left: 'Time Of Day', operator: 'Equal Or Above', right: '15:10' }
    ],
    legs: [
      {
        id: 'leg-1',
        segment: 'Open',
        instrumentType: 'Option',
        expiry: 'Current Month',
        selectionBasis: 'Spot Based',
        strikeOffset: 'ATM',
        optionType: 'CE',
        lots: 1,
        side: 'Buy',
        stopLossType: '%',
        stopLossValue: '35',
        takeProfitType: '%',
        takeProfitValue: '60'
      }
    ],
    adjustmentTiming: 'Next Minute Start',
    marginLimit: '50000',
    maxLossLimit: '2000',
    liquidityFilter: true,
    transactionStopLossType: '₹',
    transactionStopLoss: '35',
    transactionTakeProfitType: '%',
    transactionTakeProfit: '60',
    dailyStopLoss: '5000',
    dailyTakeProfit: '8000',
    tradeType: 'Intraday',
    startTime: '09:15',
    endTime: '15:14',
    maxTransactionsPerDay: 1
  };
}

function createAiAlgoConfig(contract: ContractSummary, draftTitle: string): AlgoStrategyConfig {
  const config = createDefaultAlgoConfig(contract);
  const isRange = contract.trend === 'Range';
  return {
    ...config,
    runName: draftTitle === 'Draft Algo Strategy' ? `${contract.symbol} AI Algo Strategy` : draftTitle,
    entryConditions: isRange
      ? [
          { id: 'entry-1', left: 'Current Close', operator: 'Is Above', right: `${contract.spot - Math.abs(contract.spot * 0.006)} support zone` },
          { id: 'entry-2', left: 'Current Open Interest', operator: 'Is Above', right: 'previous candle OI' }
        ]
      : [
          { id: 'entry-1', left: 'Current Close', operator: contract.trend === 'Down' ? 'Crosses Below' : 'Crosses Above', right: 'sma' },
          { id: 'entry-2', left: 'Current Volume', operator: 'Is Above', right: '20 period average' }
        ],
    legs: isRange
      ? [
          { ...config.legs[0], id: 'leg-1', side: 'Sell', optionType: 'PE', strikeOffset: 'OTM 2', stopLossValue: '45', takeProfitValue: '55' },
          { ...config.legs[0], id: 'leg-2', side: 'Buy', optionType: 'PE', strikeOffset: 'OTM 4', stopLossValue: '', takeProfitValue: '' },
          { ...config.legs[0], id: 'leg-3', side: 'Sell', optionType: 'CE', strikeOffset: 'OTM 2', stopLossValue: '45', takeProfitValue: '55' },
          { ...config.legs[0], id: 'leg-4', side: 'Buy', optionType: 'CE', strikeOffset: 'OTM 4', stopLossValue: '', takeProfitValue: '' }
        ]
      : config.legs
  };
}

function buildMarketContext(
  contract: ContractSummary,
  instrument: Instrument,
  chain: OptionQuote[],
  overviewOverride?: MarketOverview
) {
  const analytics = overviewOverride?.chain ?? computeChainAnalytics(instrument, chain);
  const overview: MarketOverview = overviewOverride ?? {
    instrument,
    regime: trendToRegime(contract.trend),
    trendScore: trendScore(contract),
    volatilityRegime: contract.annualizedVolatility > 0.55 ? 'high' as const : contract.annualizedVolatility < 0.28 ? 'low' as const : 'normal' as const,
    chain: analytics
  };
  const baseTrades = generateTopTrades(instrument, chain, analytics);

  return {
    instrument,
    chain,
    analytics,
    overview,
    baseTrades,
    tradeMatrix: buildTradeMatrix(baseTrades)
  };
}

function createMarketContext(contract: ContractSummary) {
  const instrument = instrumentsBySymbol[contract.symbol] ?? instrumentsBySymbol[defaultContract.symbol];
  const chain = optionChainsBySymbol[contract.symbol] ?? optionChainsBySymbol[defaultContract.symbol] ?? [];
  return buildMarketContext(contract, instrument, chain);
}

function liveContractSummary(base: ContractSummary, live: FnOLiveMarketState): ContractSummary {
  const analytics = live.overview?.chain;
  const spot = live.instrument.spot || base.spot;
  const previousClose = live.instrument.previousClose || spot;
  const changePct = previousClose ? round(((spot - previousClose) / previousClose) * 100, 2) : base.changePct;
  const totalCallOi = live.chain.filter((quote) => quote.type === 'CE').reduce((sum, quote) => sum + quote.oi, 0);
  const totalPutOi = live.chain.filter((quote) => quote.type === 'PE').reduce((sum, quote) => sum + quote.oi, 0);
  const totalOi = totalCallOi + totalPutOi;
  const totalOiChange = live.chain.reduce((sum, quote) => sum + quote.oiChange, 0);
  const expiryDate = live.expiry || live.instrument.expiry || base.expiryDate;
  const regime = live.overview?.regime;

  return {
    ...base,
    id: `${base.symbol}-${expiryDate || base.expiryDate}`,
    name: live.instrument.name || base.name,
    expiry: expiryDate || base.expiry,
    expiryDate: expiryDate || base.expiryDate,
    spot,
    changePct,
    pcr: analytics?.pcrOi ?? (totalCallOi ? round(totalPutOi / totalCallOi, 2) : base.pcr),
    volumePcr: analytics?.pcrVolume ?? base.volumePcr,
    atmIv: analytics?.atmIv ?? base.atmIv,
    lotSize: live.instrument.lotSize || base.lotSize,
    liquidity: analytics?.liquidityScore ?? base.liquidity,
    maxPain: analytics?.maxPain ?? base.maxPain,
    trend: regime === 'bullish' ? 'Up' : regime === 'bearish' ? 'Down' : regime === 'volatile' ? 'Volatile' : 'Range',
    buildUp: 'Live OI snapshot',
    totalOi: totalOi || base.totalOi,
    oiChangePct: totalOi ? round((totalOiChange / totalOi) * 100, 2) : base.oiChangePct,
    putOiChangePct: totalPutOi ? round((live.chain.filter((quote) => quote.type === 'PE').reduce((sum, quote) => sum + quote.oiChange, 0) / totalPutOi) * 100, 2) : base.putOiChangePct,
    callOiChangePct: totalCallOi ? round((live.chain.filter((quote) => quote.type === 'CE').reduce((sum, quote) => sum + quote.oiChange, 0) / totalCallOi) * 100, 2) : base.callOiChangePct,
    source: 'Upstox Analytics via VPS'
  };
}

function mergeLiveContracts(baseContracts: ContractSummary[], liveCache: LiveMarketCache) {
  return baseContracts.map((contract) => {
    const live = liveCache[contract.symbol];
    return live ? liveContractSummary(contract, live) : contract;
  });
}

function requestableExpiry(contract: ContractSummary) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(contract.expiryDate)) return undefined;
  const expiryTime = new Date(`${contract.expiryDate}T23:59:59+05:30`).getTime();
  return expiryTime >= Date.now() ? contract.expiryDate : undefined;
}

function trendToRegime(trend: ContractSummary['trend']) {
  if (trend === 'Up') return 'bullish' as const;
  if (trend === 'Down') return 'bearish' as const;
  if (trend === 'Volatile') return 'volatile' as const;
  return 'range-bound' as const;
}

function trendScore(contract: ContractSummary) {
  const direction = contract.trend === 'Up' ? 18 : contract.trend === 'Down' ? -18 : contract.trend === 'Volatile' ? 8 : 0;
  return Math.max(5, Math.min(95, round(50 + direction + contract.oiChangePct * 0.7 + (contract.pcr - 0.8) * 12, 1)));
}

function PageGuide({
  screen,
  activeContract,
  activeTab,
  onNavigate
}: {
  screen: Screen;
  activeContract: ContractSummary | null;
  activeTab: DetailTab;
  onNavigate: (targetScreen: Screen, tab?: DetailTab) => void;
}) {
  let locationText = '';
  let screenTitle = '';
  let actions: string[] = [];
  let destinations: Array<{ label: string; onClick: () => void }> = [];

  const contractSymbol = activeContract?.symbol || 'NIFTY';
  const tabLabel = detailTabs.find(t => t.id === activeTab)?.label || 'Overview';

  switch (screen) {
    case 'dashboard':
      locationText = 'Markets > F&O Dashboard';
      screenTitle = 'Scan the market, then select a contract';
      actions = [
        'Pick symbol',
        'Read PCR / IV / OI',
        'Choose view'
      ];
      destinations = [
        { label: 'Option Screener', onClick: () => onNavigate('screener') },
        { label: 'Create Custom Trades', onClick: () => onNavigate('create-trades') },
        { label: 'Create Algo Strategies', onClick: () => onNavigate('algo-builder') }
      ];
      break;

    case 'contract':
      locationText = `Markets > ${contractSymbol} > ${tabLabel}`;
      screenTitle = 'Read the selected contract before choosing legs';
      actions = [
        'Check trend',
        'Compare chain',
        'Open quick trades'
      ];
      destinations = [
        { label: 'Back to Dashboard', onClick: () => onNavigate('dashboard') },
        { label: 'Option Screener', onClick: () => onNavigate('screener') },
        { label: 'Create Custom Trades', onClick: () => onNavigate('create-trades') }
      ];
      break;

    case 'analyse-trade':
      locationText = `Trades > Payoff Analyser > ${contractSymbol}`;
      screenTitle = 'Validate payoff, risk and Greeks';
      actions = [
        'Max loss',
        'Breakevens',
        'Paper trade'
      ];
      destinations = [
        { label: 'Back to Option Chain', onClick: () => onNavigate('contract', 'option-chain') },
        { label: 'View All Suggested Trades', onClick: () => onNavigate('create-trades') },
        { label: 'Option Screener', onClick: () => onNavigate('screener') }
      ];
      break;

    case 'create-trades':
      locationText = 'Trades > Create Trades';
      screenTitle = 'Convert a market view into a defined-risk trade';
      actions = [
        'Select view',
        'Pick risk profile',
        'Analyse payoff'
      ];
      destinations = [
        { label: 'Option Screener', onClick: () => onNavigate('screener') },
        { label: 'Create Algo Strategy', onClick: () => onNavigate('algo-builder') },
        { label: 'F&O Dashboard', onClick: () => onNavigate('dashboard') }
      ];
      break;

    case 'algo-builder':
      locationText = 'Algo Strategies > Create Strategy';
      screenTitle = 'Turn a repeatable idea into rules';
      actions = [
        'Instrument',
        'Signals',
        'Legs + risk',
        'Backtest'
      ];
      destinations = [
        { label: 'Option Screener', onClick: () => onNavigate('screener') },
        { label: 'F&O Dashboard', onClick: () => onNavigate('dashboard') },
        { label: 'Create Custom Trades', onClick: () => onNavigate('create-trades') }
      ];
      break;

    case 'screener':
      locationText = 'Markets > Option Screener';
      screenTitle = 'Filter the option universe into actionable rows';
      actions = [
        'Liquidity',
        'Moneyness',
        'IV / OI signal'
      ];
      destinations = [
        { label: 'F&O Dashboard', onClick: () => onNavigate('dashboard') },
        { label: 'Create Custom Trades', onClick: () => onNavigate('create-trades') },
        { label: 'Create Algo Strategy', onClick: () => onNavigate('algo-builder') }
      ];
      break;

    default:
      break;
  }

  return (
    <div className="page-context-bar" aria-label="Workspace context">
      <div className="context-primary">
        <div className="context-location-trail">
          {locationText.split(' > ').map((crumb, idx, arr) => (
            <React.Fragment key={crumb}>
              <span className={idx === arr.length - 1 ? 'crumb-active' : 'crumb'}>{crumb}</span>
              {idx < arr.length - 1 && <ChevronRight size={12} className="crumb-separator" />}
            </React.Fragment>
          ))}
        </div>
        <strong>{screenTitle}</strong>
      </div>
      <div className="context-action-chips">
        {actions.map((act) => (
          <span key={act}>{act}</span>
        ))}
      </div>
      <div className="context-nav-links">
        {destinations.map((dest) => (
          <button key={dest.label} onClick={dest.onClick}>
            {dest.label} <ChevronRight size={14} />
          </button>
        ))}
      </div>
    </div>
  );
}

function FnOCopilotApp() {
  const [workspaceMode, setWorkspaceMode] = React.useState<WorkspaceMode>('standard');
  const [screen, setScreen] = React.useState<Screen>('dashboard');
  const [selectedContract, setSelectedContract] = React.useState<ContractSummary | null>(null);
  const [tab, setTab] = React.useState<DetailTab>('overview');
  const [direction, setDirection] = React.useState<DirectionKey>('volatile');
  const [selectedTradeId, setSelectedTradeId] = React.useState('');
  const [mode, setMode] = React.useState<UserMode>('create-trade');
  const [aiOpen, setAiOpen] = React.useState(false);
  const [messages, setMessages] = React.useState<ChatMessage[]>(createInitialMessages);
  const [submittedModes, setSubmittedModes] = React.useState<Partial<Record<UserMode, boolean>>>({});
  const [chatHistory, setChatHistory] = React.useState<AgentHistoryItem[]>(starterChatHistory);
  const [input, setInput] = React.useState('');
  const [algoConfig, setAlgoConfig] = React.useState<AlgoStrategyConfig>(() => createDefaultAlgoConfig(defaultContract));
  const [dataBackendStatus, setDataBackendStatus] = React.useState<DataBackendStatus>(
    isFnOCopilotEdgeEnabled() ? 'edge-online' : 'local'
  );
  const [dataMode, setDataMode] = React.useState<'demo' | 'upstox_live'>('demo');
  const [marketStatus, setMarketStatus] = React.useState<string | undefined>();
  const [liveMarketCache, setLiveMarketCache] = React.useState<LiveMarketCache>({});
  const [liveLoadingSymbol, setLiveLoadingSymbol] = React.useState<string | undefined>();
  const [liveError, setLiveError] = React.useState<string | undefined>();
  const [artifactPayloadByMode, setArtifactPayloadByMode] = React.useState<Partial<Record<UserMode, Record<string, unknown>>>>({});
  const [sessionIdsByMode, setSessionIdsByMode] = React.useState<Partial<Record<UserMode, string>>>({});
  const [isAiTyping, setIsAiTyping] = React.useState(false);
  const [showDebugPanel] = React.useState(() => {
    if (typeof window === 'undefined') return false;
    if ((import.meta as ImportMeta & { env?: Record<string, unknown> }).env?.DEV) return true;
    return new URLSearchParams(window.location.search).has('fno_debug');
  });

  const liveContracts = React.useMemo(() => mergeLiveContracts(contractRows, liveMarketCache), [liveMarketCache]);
  const selectedContractBase = selectedContract ?? defaultContract;
  const activeContract = liveContracts.find((contract) => contract.symbol === selectedContractBase.symbol) ?? selectedContractBase;
  const liveMarket = liveMarketCache[activeContract.symbol] ?? null;
  const marketContext = React.useMemo(() => {
    if (liveMarket?.mode === 'upstox_live' && liveMarket.symbol === activeContract.symbol) {
      return buildMarketContext(activeContract, liveMarket.instrument, liveMarket.chain, liveMarket.overview);
    }
    return createMarketContext(activeContract);
  }, [activeContract, liveMarket]);
  const { analytics, baseTrades, chain, instrument, overview, tradeMatrix } = marketContext;
  const activeTrades = tradeMatrix[direction];
  const selectedTrade = activeTrades.find((trade) => trade.id === selectedTradeId) ?? activeTrades[1] ?? activeTrades[0] ?? baseTrades[0];
  const allTrades = React.useMemo(() => Object.values(tradeMatrix).flat(), [tradeMatrix]);
  const liveArtifactPayload = artifactPayloadByMode[mode] ?? {};
  const activeSessionId = sessionIdsByMode[mode];
  const baseDraft = React.useMemo(() => draftFromChat(mode, messages, allTrades, overview), [mode, messages, allTrades, overview]);
  const draft = { ...baseDraft, ...(liveArtifactPayload as Partial<StrategyDraft>) };
  const workflowSteps = buildWorkflowSteps(mode, draft.status === 'ready');

  const createSessionForMode = React.useCallback(async (targetMode: UserMode) => {
    const sessionData = await initAgentSession({
      mode: targetMode,
      symbol: activeContract.symbol,
      screen_context: screen
    });
    setSessionIdsByMode((current) => ({ ...current, [targetMode]: sessionData.session_id }));
    setArtifactPayloadByMode((current) => ({
      ...current,
      [targetMode]: (sessionData.artifact_payload as Record<string, unknown>) ?? {}
    }));
    return sessionData.session_id;
  }, [activeContract.symbol, screen]);

  const patchArtifactForMode = React.useCallback((targetMode: UserMode, patch: Record<string, unknown>) => {
    setArtifactPayloadByMode((current) => ({
      ...current,
      [targetMode]: {
        ...(current[targetMode] ?? {}),
        ...patch
      }
    }));
  }, []);

  React.useEffect(() => {
    if (!activeTrades.some((trade) => trade.id === selectedTradeId)) {
      setSelectedTradeId(activeTrades[1]?.id ?? activeTrades[0]?.id ?? '');
    }
  }, [activeTrades, selectedTradeId]);

  React.useEffect(() => {
    if (!isFnOCopilotEdgeEnabled()) {
      setDataBackendStatus('local');
      setLiveError('Live Upstox path is not enabled in this frontend environment. Showing workbook fallback.');
      return;
    }

    let cancelled = false;
    const load = async () => {
      setDataBackendStatus('edge-online');
      setLiveLoadingSymbol(activeContract.symbol);
      try {
        const data = await fetchFnOCopilotBootstrap({
          instrument: activeContract.symbol,
          expiry: requestableExpiry(activeContract)
        });
        const live = parseLiveMarketBootstrap(data as Record<string, unknown>, activeContract.symbol);
        if (!cancelled && live) {
          setLiveMarketCache((current) => ({ ...current, [live.symbol]: live }));
          setDataMode('upstox_live');
          setMarketStatus(live.marketStatus);
          setLiveError(undefined);
        } else if (!cancelled) {
          setDataMode('demo');
          setLiveError(`Live data unavailable for ${activeContract.symbol}`);
        }
        if (!cancelled) setDataBackendStatus('edge-online');
      } catch (error) {
        if (!cancelled) {
          setDataBackendStatus('edge-error');
          setLiveError(error instanceof Error ? error.message : `Live data unavailable for ${activeContract.symbol}`);
        }
      } finally {
        if (!cancelled) setLiveLoadingSymbol(undefined);
      }
    };

    load();
    const intervalId = window.setInterval(load, 30000);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [activeContract.symbol, activeContract.expiryDate]);

  React.useEffect(() => {
    if (!isFnOCopilotEdgeEnabled()) return;
    if (sessionIdsByMode[mode]) return;

    let cancelled = false;
    createSessionForMode(mode)
      .then(() => {
        if (!cancelled) setDataBackendStatus('edge-online');
      })
      .catch((error) => {
        if (!cancelled) {
          console.error('Failed to initialize FnO AI session:', error);
          setDataBackendStatus('edge-error');
        }
      });

    return () => {
      cancelled = true;
    };
  }, [mode, sessionIdsByMode, createSessionForMode]);

  const openContract = (contract: ContractSummary, nextTab: DetailTab = 'overview') => {
    setSelectedContract(contract);
    setScreen('contract');
    setTab(nextTab);
    if (!selectedTradeId && activeTrades[1]) setSelectedTradeId(activeTrades[1].id);
  };

  const goFindTrades = () => {
    if (!selectedContract) {
      openContract(liveContracts[0] ?? contractRows[0], 'quick-trades');
    } else {
      setScreen('contract');
      setTab('quick-trades');
    }
  };

  const openAlgoBuilder = () => {
    setWorkspaceMode('standard');
    setMode('create-strategy');
    setScreen('algo-builder');
    setAlgoConfig((current) => ({ ...current, symbol: activeContract.symbol }));
  };

  const applyAiAlgoDraft = () => {
    setWorkspaceMode('standard');
    setAlgoConfig(createAiAlgoConfig(activeContract, draft.title));
    setMode('create-strategy');
    setScreen('algo-builder');
  };

  const openCreateTrades = () => {
    setWorkspaceMode('standard');
    setMode('create-trade');
    setScreen('create-trades');
  };

  const openScreener = () => {
    setWorkspaceMode('standard');
    setMode('screener');
    setScreen('screener');
  };

  const openAnalyseTrade = (tradeId?: string) => {
    if (tradeId) setSelectedTradeId(tradeId);
    setWorkspaceMode('standard');
    setScreen('analyse-trade');
  };

  const handlePageGuideNavigate = (targetScreen: Screen, nextTab?: DetailTab) => {
    setWorkspaceMode('standard');
    setScreen(targetScreen);
    if (nextTab) {
      setTab(nextTab);
    }
  };

  const sendMessage = async () => {
    const text = input.trim();
    if (!text) return;
    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      text,
      createdAt: new Date().toISOString()
    };
    
    // Optimistic UI update
    setMessages((current) => [...current, userMessage]);
    setInput('');
    setIsAiTyping(true);

    let assistantText = "I am processing your request...";
    const nextBaseDraft = draftFromChat(mode, [...messages, userMessage], allTrades, overview);

    if (isFnOCopilotEdgeEnabled()) {
      try {
        let resolvedSessionId = activeSessionId;
        if (!resolvedSessionId) {
          resolvedSessionId = await createSessionForMode(mode);
        }
        if (!resolvedSessionId) {
          throw new Error('No active chat session for this mode.');
        }

        const edgeReply = await sendAgentChat({
          session_id: resolvedSessionId,
          message: text,
          mode,
        });
        
        if (edgeReply.assistant_reply) {
          assistantText = edgeReply.assistant_reply;
        }
        
        if (edgeReply.artifact_payload) {
          setArtifactPayloadByMode((current) => ({
            ...current,
            [mode]: edgeReply.artifact_payload as Record<string, unknown>
          }));
        }
        
        setDataBackendStatus('edge-online');
      } catch (e) {
        console.error("Agent chat failed, falling back to local state.", e);
        assistantText = assistantReply(nextBaseDraft);
        setDataBackendStatus('edge-error');
      }
    } else {
      assistantText = assistantReply(nextBaseDraft);
    }
    
    setIsAiTyping(false);

    const assistantMessage: ChatMessage = {
      id: `assistant-${Date.now()}`,
      role: 'assistant',
      text: assistantText,
      createdAt: new Date().toISOString()
    };
    const timeLabel = new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
    const title = text.length > 58 ? `${text.slice(0, 55)}...` : text;
    setChatHistory((current) => [
      {
        id: userMessage.id,
        mode,
        title,
        preview: assistantMessage.text,
        createdAt: timeLabel
      },
      ...current
    ].slice(0, 8));
    setSubmittedModes((current) => ({ ...current, [mode]: true }));
    setMessages((current) => {
      // Find the user message we added optimistically, and append assistant message
      return [...current, assistantMessage];
    });
  };

  return (
    <div className="fno-copilot-app">
      <div className="app-shell">
        {workspaceMode === 'standard' && (
          <ProductNav
            workspaceMode={workspaceMode}
            setWorkspaceMode={setWorkspaceMode}
            dataMode={dataMode}
            marketStatus={marketStatus}
            onDashboard={() => {
              setWorkspaceMode('standard');
              setScreen('dashboard');
            }}
          />
        )}
        {workspaceMode === 'standard' && (
          <StandardModeNavStrip
            screen={screen}
            onDashboard={() => setScreen('dashboard')}
            onCreateTrades={openCreateTrades}
            onCreateAlgo={openAlgoBuilder}
            onScreener={openScreener}
          />
        )}

        <main className={`main-surface ${workspaceMode === 'agent' ? 'agent-main-surface' : ''}`}>
          {workspaceMode === 'standard' && (
            <PageGuide
              screen={screen}
              activeContract={activeContract}
              activeTab={tab}
              onNavigate={handlePageGuideNavigate}
            />
          )}
          {workspaceMode === 'agent' ? (
            <AgentModeWorkspace
              mode={mode}
              setMode={setMode}
              draft={draft}
              messages={messages}
              chatHistory={chatHistory}
              input={input}
              setInput={setInput}
              sendMessage={sendMessage}
              workflowSteps={workflowSteps}
              showArtifact={mode !== 'ask-ai' && Boolean(submittedModes[mode])}
              contracts={liveContracts}
              onNewChat={() => {
                setMessages(createInitialMessages());
                setSubmittedModes((current) => ({ ...current, [mode]: false }));
                setArtifactPayloadByMode((current) => ({ ...current, [mode]: {} }));
                setSessionIdsByMode((current) => {
                  const next = { ...current };
                  delete next[mode];
                  return next;
                });
                setInput('');
                if (isFnOCopilotEdgeEnabled()) {
                  createSessionForMode(mode).catch((error) => {
                    console.error('Failed to create new chat session:', error);
                    setDataBackendStatus('edge-error');
                  });
                }
              }}
              onOpenData={() => {
                setWorkspaceMode('standard');
                setScreen(selectedContract ? 'contract' : 'dashboard');
              }}
              onOpenTrade={(tradeId) => openAnalyseTrade(tradeId)}
              onPatchArtifact={(patch) => patchArtifactForMode(mode, patch)}
              onOpenScreener={openScreener}
            />
          ) : screen === 'algo-builder' ? (
            <CreateAlgoWorkspace
              config={algoConfig}
              setConfig={setAlgoConfig}
              aiDraft={draft}
              selectedContract={activeContract}
              contracts={liveContracts}
              onApplyAiDraft={applyAiAlgoDraft}
            />
          ) : screen === 'create-trades' ? (
            <CreateTradesWorkspace
              activeContract={activeContract}
              contracts={liveContracts}
              topTrades={baseTrades.slice(0, 5)}
              tradeMatrix={tradeMatrix}
              onOpenContract={openContract}
              onAnalyseTrade={openAnalyseTrade}
            />
          ) : screen === 'screener' ? (
            <OptionScreener
              contracts={liveContracts}
              liveMarketCache={liveMarketCache}
              onOpenContract={openContract}
              onAnalyseTrade={openAnalyseTrade}
            />
          ) : screen === 'analyse-trade' ? (
            <TradeAnalysisPage trade={selectedTrade} instrument={instrument} contract={activeContract} onBack={() => setScreen(selectedContract ? 'contract' : 'dashboard')} />
          ) : screen === 'dashboard' || !selectedContract ? (
            <OptionsDashboard
              onSelectContract={openContract}
              dataMode={dataMode}
              marketStatus={marketStatus}
              liveMarket={liveMarket}
              contracts={liveContracts}
              liveMarketCache={liveMarketCache}
              liveLoadingSymbol={liveLoadingSymbol}
              liveError={liveError}
            />
          ) : (
            <ContractDetail
              contract={selectedContract}
              instrument={instrument}
              chain={chain}
              analytics={analytics}
              topTrades={baseTrades.slice(0, 5)}
              tab={tab}
              setTab={setTab}
              direction={direction}
              setDirection={setDirection}
              selectedTrade={selectedTrade}
              selectedTradeId={selectedTradeId}
              setSelectedTradeId={setSelectedTradeId}
              activeTrades={activeTrades}
              onBack={() => setScreen('dashboard')}
              onAnalyseTrade={openAnalyseTrade}
            />
          )}
        </main>

        {workspaceMode === 'standard' && (
          <FloatingAIAssistant
            mode={mode}
            setMode={setMode}
            screen={screen}
            open={aiOpen}
            setOpen={setAiOpen}
            onCreateTrades={openCreateTrades}
            onCreateAlgo={openAlgoBuilder}
            onScreener={openScreener}
            onQuickTrades={goFindTrades}
            onOpenAgent={() => setWorkspaceMode('agent')}
            messages={messages}
            input={input}
            setInput={setInput}
            sendMessage={sendMessage}
            draftTitle={draft.title}
            draftStatus={draft.status}
            workflowSteps={workflowSteps}
          />
        )}
        {showDebugPanel && (
          <FnODebugPanel
            mode={mode}
            sessionIdsByMode={sessionIdsByMode}
            dataBackendStatus={dataBackendStatus}
            isAiTyping={isAiTyping}
            submittedModes={submittedModes}
            artifactPayloadByMode={artifactPayloadByMode}
            activeArtifactStatus={draft.status}
          />
        )}
      </div>
    </div>
  );
}

function FnODebugPanel({
  mode,
  sessionIdsByMode,
  dataBackendStatus,
  isAiTyping,
  submittedModes,
  artifactPayloadByMode,
  activeArtifactStatus
}: {
  mode: UserMode;
  sessionIdsByMode: Partial<Record<UserMode, string>>;
  dataBackendStatus: DataBackendStatus;
  isAiTyping: boolean;
  submittedModes: Partial<Record<UserMode, boolean>>;
  artifactPayloadByMode: Partial<Record<UserMode, Record<string, unknown>>>;
  activeArtifactStatus: string;
}) {
  const formatSession = (value?: string) => (value ? `${value.slice(0, 8)}...` : '—');
  const modeRows: UserMode[] = ['create-trade', 'create-strategy', 'screener', 'ask-ai'];

  return (
    <aside className="fno-debug-panel" aria-label="FnO debug panel">
      <p className="fno-debug-title">FnO Debug</p>
      <p>active_mode: <strong>{mode}</strong></p>
      <p>backend: <strong>{dataBackendStatus}</strong></p>
      <p>ai_typing: <strong>{isAiTyping ? 'yes' : 'no'}</strong></p>
      <p>artifact_status: <strong>{activeArtifactStatus}</strong></p>
      <div className="fno-debug-table">
        {modeRows.map((item) => {
          const payloadSize = Object.keys(artifactPayloadByMode[item] ?? {}).length;
          return (
            <div key={item} className={`fno-debug-row ${item === mode ? 'active' : ''}`}>
              <span>{item}</span>
              <span>{formatSession(sessionIdsByMode[item])}</span>
              <span>{submittedModes[item] ? 'sent' : 'idle'}</span>
              <span>{payloadSize}</span>
            </div>
          );
        })}
      </div>
    </aside>
  );
}

function ProductNav({
  workspaceMode,
  setWorkspaceMode,
  dataMode,
  marketStatus,
  onDashboard
}: {
  workspaceMode: WorkspaceMode;
  setWorkspaceMode: (mode: WorkspaceMode) => void;
  dataMode: 'demo' | 'upstox_live';
  marketStatus?: string;
  onDashboard: () => void;
}) {
  return (
    <header className="product-nav">
      <button className="brand-row nav-brand" onClick={onDashboard}>
        <div className="brand-mark"><Sparkles size={18} /></div>
        <div>
          <h1>FnO Co-Pilot</h1>
        </div>
      </button>
      <div className="product-nav-actions">
        <span className={`data-mode-pill ${dataMode === 'upstox_live' ? 'live' : 'demo'}`}>
          {dataMode === 'upstox_live' ? 'Live · Upstox Analytics' : 'Workbook fallback'}
          {marketStatus ? ` · ${marketStatus}` : ''}
        </span>
        <div className="workspace-switch" aria-label="Workspace mode">
        <button className={workspaceMode === 'standard' ? 'active' : ''} onClick={() => setWorkspaceMode('standard')}>Standard</button>
        <button className={workspaceMode === 'agent' ? 'active' : ''} onClick={() => setWorkspaceMode('agent')}><Bot size={14} /> Agent</button>
        </div>
      </div>
    </header>
  );
}

function StandardModeNavStrip({
  screen,
  onDashboard,
  onCreateTrades,
  onCreateAlgo,
  onScreener
}: {
  screen: Screen;
  onDashboard: () => void;
  onCreateTrades: () => void;
  onCreateAlgo: () => void;
  onScreener: () => void;
}) {
  return (
    <nav className="standard-nav-strip" aria-label="Primary">
      <button className={screen === 'dashboard' || screen === 'contract' || screen === 'analyse-trade' ? 'active' : ''} onClick={onDashboard}><Layers3 size={16} /> FnO Data</button>
      <button className={screen === 'create-trades' ? 'active' : ''} onClick={onCreateTrades}><Target size={16} /> Create Trades</button>
      <button className={screen === 'algo-builder' ? 'active' : ''} onClick={onCreateAlgo}><BrainCircuit size={16} /> Create Algo Strategies</button>
      <button className={screen === 'screener' ? 'active' : ''} onClick={onScreener}><ListFilter size={16} /> Option Screener</button>
    </nav>
  );
}

function AgentModeWorkspace({
  mode,
  setMode,
  draft,
  messages,
  chatHistory,
  input,
  setInput,
  sendMessage,
  workflowSteps,
  showArtifact,
  onNewChat,
  onOpenData,
  onOpenTrade,
  onPatchArtifact,
  onOpenScreener
}: {
  mode: UserMode;
  setMode: (mode: UserMode) => void;
  draft: ReturnType<typeof draftFromChat>;
  messages: ChatMessage[];
  chatHistory: AgentHistoryItem[];
  input: string;
  setInput: (value: string) => void;
  sendMessage: () => void;
  workflowSteps: ReturnType<typeof buildWorkflowSteps>;
  showArtifact: boolean;
  contracts: ContractSummary[];
  onNewChat: () => void;
  onOpenData: () => void;
  onOpenTrade: (tradeId?: string) => void;
  onPatchArtifact: (patch: Record<string, unknown>) => void;
  onOpenScreener: () => void;
}) {
  const selectedTrade = draft.selectedTrade;
  const visibleMessages = messages.filter((message) => message.id !== 'welcome' || messages.some((item) => item.role === 'user'));
  const hasChatActive = visibleMessages.length > 0 || input.trim().length > 0;
  const modeButtons: Array<{ id: UserMode; label: string; icon: React.ReactNode }> = [
    { id: 'ask-ai', label: 'Ask AI', icon: <Bot size={16} /> },
    { id: 'create-strategy', label: 'Create Algo', icon: <BrainCircuit size={16} /> },
    { id: 'create-trade', label: 'Create Trades', icon: <Target size={16} /> },
    { id: 'screener', label: 'Option Screener', icon: <ListFilter size={16} /> }
  ];
  const examples: Record<UserMode, string> = {
    'ask-ai': 'Explain why PCR and max pain matter for this screen.',
    'create-strategy': 'Create an intraday range algo with defined risk, liquidity filters, entry, exit, and backtest plan.',
    'create-trade': 'Find a bullish trade with max loss under 5000, liquid strikes, and exit rules.',
    screener: 'Screen liquid near-ATM options with IV rank above 70, high OI change, and spread below 3%.'
  };

  return (
    <div className="agent-shell">
      <div className="agent-top-switch" aria-label="Workspace mode">
        <button onClick={onOpenData}><Layers3 size={15} /> Standard</button>
        <button className="active"><Bot size={15} /> Agent</button>
      </div>
      <aside className="agent-sidebar">
        <div className="agent-sidebar-brand">
          <div className="brand-mark"><Sparkles size={17} /></div>
          <div>
            <p className="eyebrow">FnO Co-Pilot</p>
            <h2>Agent workspace</h2>
          </div>
        </div>
        <button className="agent-new-chat" onClick={onNewChat}><span>+</span> New chat</button>
        <div className="agent-sidebar-section">
          <p><Clock3 size={13} /> Recent chats</p>
          <div className="agent-history-list">
            {chatHistory.map((item) => (
              <button key={item.id} onClick={() => setMode(item.mode)}>
                <strong>{item.title}</strong>
                <span>{agentModeLabels[item.mode]} · {item.createdAt}</span>
              </button>
            ))}
          </div>
        </div>
      </aside>

      <section className={`agent-stage ${showArtifact ? 'with-artifact' : ''} ${hasChatActive ? 'chat-active' : ''}`}>
        <div className="agent-center">
          {visibleMessages.length > 0 ? (
            <div className="agent-thread">
              {visibleMessages.slice(-6).map((message) => (
                <div key={message.id} className={`agent-thread-message ${message.role}`}>
                  <span>{message.role === 'assistant' ? 'FnO Agent' : 'You'}</span>
                  <p>{message.text}</p>
                </div>
              ))}
              {aiTyping && (
                <div className="agent-thread-message assistant">
                  <span>FnO Agent</span>
                  <div className="typing-indicator">
                    <span></span><span></span><span></span>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="agent-welcome">
              <Sparkles size={36} />
              <h2>What should we work on?</h2>
              <p>{mode === 'ask-ai' ? 'Ask anything about the option chain, Greeks, IV, OI, or payoff behaviour.' : 'Describe the trade, algo, or screener you want. I will ask for missing inputs before creating an artifact.'}</p>
            </div>
          )}

          <div className="agent-prompt-card">
            <input
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') sendMessage();
              }}
              placeholder={examples[mode]}
            />
            <div className="agent-prompt-tools">
              <button aria-label="Attach context">+</button>
              <button onClick={sendMessage}><Send size={16} /></button>
            </div>
          </div>

          {visibleMessages.length === 0 && (
            <div className="agent-quick-pills">
              {modeButtons.map((item) => (
                <button key={item.id} className={mode === item.id ? 'active' : ''} onClick={() => setMode(item.id)}>
                  {item.icon}{item.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {showArtifact && (
          <aside className="agent-artifact-panel">
            <div className="agent-artifact-header">
              <div>
                <p>Artifact</p>
                <h3>{draft.title}</h3>
              </div>
              <span className={`status-pill ${draft.status}`}>{draft.status === 'ready' ? 'Ready' : 'Needs inputs'}</span>
            </div>

            {draft.status === 'needs-input' && <InfoBlock title="Missing inputs" items={draft.missingInputs} />}

            {mode === 'create-trade' && selectedTrade && (
              <div className="agent-artifact-stack">
                <AgentTradeVisual trade={selectedTrade} />
                <InfoBlock title="Specific trade" items={[selectedTrade.strategy, selectedTrade.thesis, `Score ${selectedTrade.score} · POP ${selectedTrade.pop}% · Max loss ${rupee(selectedTrade.maxLoss)}`]} />
                <div className="agent-leg-list">
                  {selectedTrade.legs.map((leg) => (
                    <span key={leg.id}><b>{leg.side}</b>{leg.strike} {leg.type}<em>₹{leg.premium}</em></span>
                  ))}
                </div>
                <button className="wide-primary" onClick={() => onOpenTrade(selectedTrade.id)}><Target size={15} /> Analyse Trade</button>
              </div>
            )}

            {mode === 'create-strategy' && (
              <div className="agent-artifact-stack">
                <AgentRulesVisual draft={draft} />
                <AgentAlgoSections draft={draft} contracts={contractRows} onPatch={onPatchArtifact} />
              </div>
            )}

            {mode === 'screener' && (
              <div className="agent-artifact-stack">
                <AgentScreenerVisual draft={draft} />
                <InfoBlock title="Screener filters" items={draft.filters} />
                <InfoBlock title="Result handling" items={draft.entryRules} />
                <button className="wide-primary" onClick={onOpenScreener}><ListFilter size={15} /> Run Option Screener</button>
              </div>
            )}

            <div className="workflow-rail agent-workflow">
              {workflowSteps.map((step) => (
                <div key={step.label} className={`workflow-dot ${step.state}`}>
                  <i />
                  <span>{step.label}</span>
                </div>
              ))}
            </div>
          </aside>
        )}
      </section>
    </div>
  );
}

function AgentTradeVisual({ trade }: { trade: CandidateTrade }) {
  return (
    <div className="agent-visual-card">
      <div className="agent-kpi-grid">
        <span><b>Score</b><strong>{trade.score}</strong></span>
        <span><b>POP</b><strong>{trade.pop}%</strong></span>
        <span><b>Max loss</b><strong>{rupee(trade.maxLoss)}</strong></span>
      </div>
      <ResponsiveContainer width="100%" height={150}>
        <AreaChart data={trade.payoff}>
          <defs>
            <linearGradient id={`agentPayoff-${trade.id}`} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="#2f7d58" stopOpacity={0.28} />
              <stop offset="100%" stopColor="#2f7d58" stopOpacity={0.04} />
            </linearGradient>
          </defs>
          <XAxis dataKey="spot" hide />
          <YAxis hide />
          <Tooltip formatter={(value: number) => rupee(value)} />
          <Area dataKey="pnl" stroke="#2f7d58" fill={`url(#agentPayoff-${trade.id})`} strokeWidth={2} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

function AgentRulesVisual({ draft }: { draft: ReturnType<typeof draftFromChat> }) {
  const counts = [
    { label: 'Filters', value: draft.filters.length },
    { label: 'Entry', value: draft.entryRules.length },
    { label: 'Exit', value: draft.exitRules.length },
    { label: 'Risk', value: draft.riskRules.length }
  ];
  return (
    <div className="agent-visual-card">
      <div className="agent-rule-map">
        {counts.map((item) => (
          <span key={item.label}>
            <b>{item.value}</b>
            <em>{item.label}</em>
          </span>
        ))}
      </div>
    </div>
  );
}

function AgentAlgoSections({
  draft,
  contracts,
  onPatch
}: {
  draft: ReturnType<typeof draftFromChat>;
  contracts: ContractSummary[];
  onPatch: (patch: Record<string, unknown>) => void;
}) {
  const [stage, setStage] = React.useState<1 | 2 | 3 | 4>(1);
  const payload = draft as unknown as Record<string, unknown>;
  const readString = (key: string, fallback = '') => typeof payload[key] === 'string' ? String(payload[key]) : fallback;

  const readLines = (key: string, fallback: string[]) =>
    Array.isArray(payload[key]) ? (payload[key] as unknown[]).map((item) => String(item)).join('\n') : fallback.join('\n');
  const toLines = (value: string) => value.split('\n').map((item) => item.trim()).filter(Boolean);

  return (
    <div className="agent-algo-sections">
      <div className="agent-algo-stage-row">
        <button className={stage === 1 ? 'active' : ''} onClick={() => setStage(1)}>1. Setup</button>
        <button className={stage === 2 ? 'active' : ''} onClick={() => setStage(2)}>2. Signals</button>
        <button className={stage === 3 ? 'active' : ''} onClick={() => setStage(3)}>3. Legs and Risk</button>
        <button className={stage === 4 ? 'active' : ''} onClick={() => setStage(4)}>4. Validate</button>
      </div>

      {stage === 1 && (
        <div className="agent-algo-editor">
          <label><span>Run Name</span><input value={readString('runName', draft.title)} onChange={(event) => onPatch({ runName: event.target.value })} /></label>
          <label><span>Symbol</span>
            <select value={readString('symbol', '')} onChange={(event) => onPatch({ symbol: event.target.value })}>
              <option value="">Select</option>
              {contracts.map(c => <option key={c.symbol} value={c.symbol}>{c.symbol}</option>)}
            </select>
          </label>
          <label><span>Instrument Segment</span>
            <select value={readString('instrumentSegment', '')} onChange={(event) => onPatch({ instrumentSegment: event.target.value })}>
              <option value="">Select</option>
              <option value="Equity & Index">Equity & Index</option>
              <option value="Future & Options">Future & Options</option>
            </select>
          </label>
          <label><span>Trade Type</span>
            <select value={readString('tradeType', '')} onChange={(event) => onPatch({ tradeType: event.target.value })}>
              <option value="">Select</option>
              <option value="Intraday">Intraday</option>
              <option value="Positional">Positional</option>
            </select>
          </label>
          <label><span>Total Margin Limit</span><input value={readString('marginLimit', '')} onChange={(event) => onPatch({ marginLimit: event.target.value })} /></label>
        </div>
      )}

      {stage === 2 && (
        <div className="agent-algo-editor">
          <label><span>Entry Rules (overall)</span><textarea rows={2} value={readLines('entryRules', draft.entryRules)} onChange={(event) => onPatch({ entryRules: toLines(event.target.value) })} /></label>
          <label><span>Exit Rules (overall)</span><textarea rows={2} value={readLines('exitRules', draft.exitRules)} onChange={(event) => onPatch({ exitRules: toLines(event.target.value) })} /></label>
          
          <h4 style={{marginTop: 12, fontSize: 13, textTransform: 'uppercase', color: 'var(--muted)'}}>Configured Indicators</h4>
          {Array.isArray(payload.indicators) ? payload.indicators.map((ind: any, i) => {
            if (typeof ind === 'string') return <div key={i} className="agent-market-card">{ind}</div>;
            return (
              <div key={i} className="agent-market-card" style={{padding: 12}}>
                <strong>{ind.type} <span style={{fontSize: 12, fontWeight: 'normal'}}>({ind.name})</span></strong>
                <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 8}}>
                  <label><span>Chart</span><select value={ind.chartType || ''} onChange={(e) => {
                    const next = [...payload.indicators as any[]]; next[i] = { ...next[i], chartType: e.target.value }; onPatch({ indicators: next });
                  }}><option value="Candle">Candle</option><option value="Heikin Ashi">Heikin Ashi</option></select></label>
                  <label><span>Interval</span><select value={ind.candleInterval || ''} onChange={(e) => {
                    const next = [...payload.indicators as any[]]; next[i] = { ...next[i], candleInterval: e.target.value }; onPatch({ indicators: next });
                  }}><option value="1 minute">1 min</option><option value="5 minutes">5 mins</option><option value="15 minutes">15 mins</option><option value="1 hour">1 hour</option></select></label>
                </div>
                <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 8}}>
                  <label><span>Period</span><input type="number" value={ind.period || ''} onChange={(e) => {
                    const next = [...payload.indicators as any[]]; next[i] = { ...next[i], period: parseInt(e.target.value, 10) }; onPatch({ indicators: next });
                  }} /></label>
                  <label><span>Field</span><input value={ind.field || ''} readOnly/></label>
                </div>
              </div>
            );
          }) : <div style={{fontSize: 12, color: 'var(--muted)'}}>No indicators configured.</div>}
        </div>
      )}

      {stage === 3 && (
        <div className="agent-algo-editor">
          <h4 style={{fontSize: 13, textTransform: 'uppercase', color: 'var(--muted)'}}>Legs</h4>
          {Array.isArray(payload.legs) && payload.legs.length > 0 ? payload.legs.map((leg: any, i) => (
             <div key={i} className="agent-market-card" style={{padding: 12}}>
               <strong style={{color: leg.action === 'Buy' ? 'var(--green)' : 'var(--red)'}}>{leg.action} {leg.optionType || leg.instrument} <span style={{fontSize: 12, fontWeight: 'normal'}}>({leg.strikeOffset})</span></strong>
               <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 8}}>
                 <label><span>Segment</span><input value={leg.segment || ''} readOnly/></label>
                 <label><span>Expiry</span><input value={leg.expiry || ''} readOnly/></label>
               </div>
               <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 8}}>
                 <label><span>Entry</span><input value={leg.entryCondition || ''} readOnly/></label>
                 <label><span>Exit</span><input value={leg.exitCondition || ''} readOnly/></label>
               </div>
               <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 8}}>
                 <label><span>Stop Loss</span><input value={leg.stopLoss ? `${leg.stopLoss.value} ${leg.stopLoss.type}` : ''} readOnly/></label>
                 <label><span>Take Profit</span><input value={leg.takeProfit ? `${leg.takeProfit.value} ${leg.takeProfit.type}` : ''} readOnly/></label>
               </div>
             </div>
          )) : (
            <label><span>Legs (fallback strings)</span><textarea rows={3} value={readLines('legs', [])} onChange={(event) => onPatch({ legs: toLines(event.target.value) })} /></label>
          )}

          <h4 style={{marginTop: 12, fontSize: 13, textTransform: 'uppercase', color: 'var(--muted)'}}>Global Targets</h4>
          {payload.globalTargets ? (
            <div className="agent-market-card" style={{padding: 12}}>
              <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8}}>
                <label><span>Daily SL</span><input value={(payload.globalTargets as any).dailyStopLoss || ''} onChange={(e) => onPatch({ globalTargets: { ...(payload.globalTargets as any), dailyStopLoss: e.target.value } })} /></label>
                <label><span>Daily TP</span><input value={(payload.globalTargets as any).dailyTakeProfit || ''} onChange={(e) => onPatch({ globalTargets: { ...(payload.globalTargets as any), dailyTakeProfit: e.target.value } })} /></label>
              </div>
              <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 8}}>
                <label><span>Trade Type</span><input value={(payload.globalTargets as any).tradeType || ''} onChange={(e) => onPatch({ globalTargets: { ...(payload.globalTargets as any), tradeType: e.target.value } })} /></label>
                <label><span>Max Trades</span><input value={(payload.globalTargets as any).maxTransactionsPerDay || ''} onChange={(e) => onPatch({ globalTargets: { ...(payload.globalTargets as any), maxTransactionsPerDay: e.target.value } })} /></label>
              </div>
            </div>
          ) : (
            <>
              <label><span>Max Loss per Trade</span><input value={readString('maxLossLimit', '')} onChange={(event) => onPatch({ maxLossLimit: event.target.value })} /></label>
              <label><span>Daily Stop Loss</span><input value={readString('dailyStopLoss', '')} onChange={(event) => onPatch({ dailyStopLoss: event.target.value })} /></label>
            </>
          )}
        </div>
      )}

      {stage === 4 && (
        <div className="agent-algo-editor">
          <InfoBlock title="Validation status" items={[
            draft.status === 'ready' ? 'Ready to validate' : 'Needs more inputs before validate',
            ...(draft.missingInputs.length ? draft.missingInputs : ['No missing inputs'])
          ]} />
          <label><span>Validation Notes</span><textarea rows={4} value={readString('validationNotes', '')} onChange={(event) => onPatch({ validationNotes: event.target.value })} /></label>
          <p className="agent-algo-note">Edits stay in Agent mode and update this artifact directly.</p>
        </div>
      )}
    </div>
  );
}

function AgentScreenerVisual({ draft }: { draft: ReturnType<typeof draftFromChat> }) {
  return (
    <div className="agent-visual-card">
      <div className="agent-filter-cloud">
        {draft.filters.slice(0, 5).map((filter) => <span key={filter}>{filter}</span>)}
      </div>
    </div>
  );
}

function FloatingAIAssistant({
  mode,
  setMode,
  screen,
  open,
  setOpen,
  onCreateTrades,
  onCreateAlgo,
  onScreener,
  onQuickTrades,
  onOpenAgent,
  messages,
  input,
  setInput,
  sendMessage,
  draftTitle,
  draftStatus,
  workflowSteps
}: {
  mode: UserMode;
  setMode: (mode: UserMode) => void;
  screen: Screen;
  open: boolean;
  setOpen: (open: boolean) => void;
  onCreateTrades: () => void;
  onCreateAlgo: () => void;
  onScreener: () => void;
  onQuickTrades: () => void;
  onOpenAgent: () => void;
  messages: ChatMessage[];
  input: string;
  setInput: (value: string) => void;
  sendMessage: () => void;
  draftTitle: string;
  draftStatus: string;
  workflowSteps: ReturnType<typeof buildWorkflowSteps>;
}) {
  const [showModes, setShowModes] = React.useState(false);
  const modeButtons: Array<{ id: UserMode; label: string; icon: React.ReactNode; onClick?: () => void }> = [
    { id: 'ask-ai', label: 'Ask AI', icon: <Bot size={15} /> },
    { id: 'create-strategy', label: 'Create Algo', icon: <BrainCircuit size={15} />, onClick: onCreateAlgo },
    { id: 'create-trade', label: 'Create Trades', icon: <Target size={15} />, onClick: onCreateTrades },
    { id: 'screener', label: 'Option Screener', icon: <ListFilter size={15} />, onClick: onScreener }
  ];

  return (
    <div className={`floating-ai ${open ? 'open' : ''}`}>
      {open && (
        <aside className="ai-drawer">
          <div className="card-heading">
            <MessagesSquare size={16} />
            <span>Chat with AI</span>
            <button className="drawer-close" onClick={() => setOpen(false)}>Close</button>
          </div>
          <div className="floating-ai-task-row">
            <button className="ghost-action" onClick={() => setShowModes((current) => !current)}>{showModes ? 'Hide task picker' : 'Change task'}</button>
            <button className="ghost-action" onClick={onOpenAgent}><Bot size={14} /> Open full Agent mode</button>
          </div>
          {showModes && (
            <div className="mode-grid">
              {modeButtons.map((item) => (
                <button
                  key={item.id}
                  className={mode === item.id ? 'active' : ''}
                  onClick={() => {
                    setMode(item.id);
                    item.onClick?.();
                  }}
                >
                  {item.icon}{item.label}
                </button>
              ))}
            </div>
          )}
          <p className="context-chip">Context: {labelize(screen)}</p>
        <div className="mini-chat">
          {messages.slice(-2).map((message) => (
            <div key={message.id} className={`mini-message ${message.role}`}>{message.text}</div>
          ))}
        </div>
        <div className="composer">
          <input
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') sendMessage();
            }}
            placeholder={mode === 'ask-ai' ? 'Ask what this means...' : mode === 'screener' ? 'Describe a scan...' : mode === 'create-trade' ? 'Create a trade...' : 'Create rules...'}
          />
          <button onClick={sendMessage} aria-label="Send message"><Send size={15} /></button>
        </div>

          <div className="ai-artifact-card">
            <p className="eyebrow">Current AI artifact</p>
            <h2>{draftTitle}</h2>
            <span className={`status-pill ${draftStatus}`}>{draftStatus === 'ready' ? 'Ready' : 'Needs inputs'}</span>
            <button className="ghost-action" onClick={onQuickTrades}><Target size={14} /> Open Quick Trades</button>
          </div>

          <div className="workflow-rail chips">
            {workflowSteps.map((step) => (
              <span key={step.label} className={`workflow-chip ${step.state}`}>{step.label}</span>
            ))}
          </div>
        </aside>
      )}
      <button className="ai-bubble" onClick={() => setOpen(!open)}>
        <Bot size={22} />
        <span>AI</span>
      </button>
    </div>
  );
}

function readUpstoxInfoNumber(info: Record<string, unknown> | undefined, block: string, field: string) {
  const result = info?.[block] as { ok?: boolean; data?: Record<string, unknown> } | undefined;
  if (!result?.ok) return undefined;
  const value = Number(result.data?.[field]);
  return Number.isFinite(value) ? value : undefined;
}

function getLiveMarketInformationRows(info: Record<string, unknown> | undefined) {
  const totalPuts = readUpstoxInfoNumber(info, 'oi', 'total_puts');
  const totalCalls = readUpstoxInfoNumber(info, 'oi', 'total_calls');
  const putChange = readUpstoxInfoNumber(info, 'changeOi', 'total_put_change_oi');
  const callChange = readUpstoxInfoNumber(info, 'changeOi', 'total_call_change_oi');
  const rows = [
    { label: 'Official PCR', value: readUpstoxInfoNumber(info, 'pcr', 'pcr')?.toFixed(2) ?? 'Pending' },
    { label: 'Max pain', value: formatMaybeRupee(readUpstoxInfoNumber(info, 'maxPain', 'max_pain')) },
    { label: 'OI totals', value: totalPuts !== undefined && totalCalls !== undefined ? `P ${compactNumber(totalPuts)} / C ${compactNumber(totalCalls)}` : 'Pending' },
    { label: 'OI change', value: putChange !== undefined && callChange !== undefined ? `P ${compactNumber(putChange)} / C ${compactNumber(callChange)}` : 'Pending' }
  ];
  return rows;
}

function formatMaybeRupee(value: number | undefined) {
  if (!Number.isFinite(value)) return 'Pending';
  return `₹${Number(value).toLocaleString('en-IN')}`;
}

function compactNumber(value: number) {
  return new Intl.NumberFormat('en-IN', { notation: 'compact', maximumFractionDigits: 1 }).format(value);
}

function BeginnerFlowStrip() {
  const steps = [
    { title: '1. Pick', body: 'Choose the index or FnO stock you actually want to understand.' },
    { title: '2. Read', body: 'Check trend, PCR, IV, max pain, liquidity and news risk.' },
    { title: '3. Compare', body: 'Use Top Trades or Quick Trades to see capped-risk choices.' },
    { title: '4. Analyse', body: 'Open payoff, max loss, breakeven and Greeks before paper trading.' }
  ];

  return (
    <section className="beginner-flow-strip" aria-label="Beginner workflow">
      <div>
        <p className="eyebrow">New trader route</p>
        <h3>Do not start from strikes. Start from the decision.</h3>
      </div>
      <div className="beginner-step-row">
        {steps.map((step) => (
          <span key={step.title}>
            <strong>{step.title}</strong>
            <small>{step.body}</small>
          </span>
        ))}
      </div>
    </section>
  );
}

function ConceptStrip({ dataMode }: { dataMode: 'demo' | 'upstox_live' }) {
  const concepts = [
    { label: 'PCR', value: 'Put-call ratio', body: 'Above 1 usually means more put OI; below 1 usually means call-side pressure.' },
    { label: 'IV', value: 'Implied volatility', body: 'Higher IV means expensive options and larger expected moves.' },
    { label: 'OI', value: 'Open interest', body: 'Shows where traders have built positions. OI change tells what is moving today.' },
    { label: 'MWPL', value: 'Position limit', body: 'High MWPL can make stock FnO riskier because fresh positions may be restricted.' }
  ];

  return (
    <section className="concept-strip">
      <div className="panel-header">
        <div>
          <p className="eyebrow">Plain English layer</p>
          <h3>What the dashboard is trying to tell you</h3>
        </div>
        <span className="badge">{dataMode === 'upstox_live' ? 'Live context' : 'Workbook context'}</span>
      </div>
      <div className="concept-grid">
        {concepts.map((concept) => (
          <article key={concept.label}>
            <strong>{concept.label}</strong>
            <span>{concept.value}</span>
            <small>{concept.body}</small>
          </article>
        ))}
      </div>
    </section>
  );
}

function ContractDecisionGuide({
  contract,
  analytics,
  onQuickTrades,
  onAnalyseTrade
}: {
  contract: ContractSummary;
  analytics: ChainAnalytics;
  onQuickTrades: () => void;
  onAnalyseTrade: () => void;
}) {
  const pcrLabel = analytics.pcrOi >= 1.1 ? 'put-heavy' : analytics.pcrOi <= 0.85 ? 'call-heavy' : 'balanced';
  const ivLabel = analytics.atmIv >= 25 ? 'expensive options' : analytics.atmIv <= 13 ? 'cheaper options' : 'normal IV';
  const riskNote = contract.mwpl >= 80
    ? 'MWPL is high, so keep position size small and avoid crowded stock-option trades.'
    : 'Liquidity and position-limit risk look acceptable for educational analysis.';

  return (
    <section className="decision-guide-card">
      <div>
        <p className="eyebrow">Beginner read</p>
        <h3>{contract.symbol}: what to decide before choosing legs</h3>
        <p>{contract.trend} trend, {pcrLabel} PCR and {ivLabel}. {riskNote}</p>
      </div>
      <div className="decision-meter-grid">
        <span><b>PCR</b><em>{analytics.pcrOi}</em><small>{pcrLabel}</small></span>
        <span><b>IV</b><em>{analytics.atmIv}%</em><small>{ivLabel}</small></span>
        <span><b>Liquidity</b><em>{analytics.liquidityScore}/100</em><small>tradeability</small></span>
      </div>
      <div className="decision-guide-actions">
        <button onClick={onQuickTrades}><Target size={14} /> Compare Quick Trades</button>
        <button onClick={onAnalyseTrade}><ShieldCheck size={14} /> Analyse Top Trade</button>
      </div>
    </section>
  );
}

function OptionsDashboard({
  onSelectContract,
  dataMode,
  marketStatus,
  liveMarket,
  contracts,
  liveMarketCache,
  liveLoadingSymbol,
  liveError
}: {
  onSelectContract: (contract: ContractSummary) => void;
  dataMode: 'demo' | 'upstox_live';
  marketStatus?: string;
  liveMarket: FnOLiveMarketState | null;
  contracts: ContractSummary[];
  liveMarketCache: LiveMarketCache;
  liveLoadingSymbol?: string;
  liveError?: string;
}) {
  const [query, setQuery] = React.useState('');
  const [trendFilter, setTrendFilter] = React.useState<'All' | ContractSummary['trend']>('All');
  const [contractView, setContractView] = React.useState<'top' | 'all'>('top');
  const filteredContracts = React.useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return contracts
      .filter((contract) => trendFilter === 'All' || contract.trend === trendFilter)
      .filter((contract) => {
        if (!normalized) return true;
        return [contract.symbol, contract.name, contract.industry].some((value) => value.toLowerCase().includes(normalized));
      });
  }, [contracts, query, trendFilter]);
  const medianPcr = median(contracts.map((contract) => contract.pcr));
  const highMwpl = contracts.filter((contract) => contract.mwpl >= 80).length;
  const latestUpdated = defaultContract ? instrumentsBySymbol[defaultContract.symbol]?.snapshotTs : dataSource.generatedAt;
  const nifty = contracts.find((contract) => contract.symbol === 'NIFTY') ?? contracts[0];
  const bankNifty = contracts.find((contract) => contract.symbol === 'BANKNIFTY') ?? contracts[1] ?? contracts[0];
  const activity = React.useMemo(() => ({
    callsActive: buildActivityRows('CE', 'volume', contracts, liveMarketCache),
    callsGainers: buildActivityRows('CE', 'price', contracts, liveMarketCache),
    callsOi: buildActivityRows('CE', 'oi', contracts, liveMarketCache),
    putsActive: buildActivityRows('PE', 'volume', contracts, liveMarketCache),
    putsGainers: buildActivityRows('PE', 'price', contracts, liveMarketCache),
    putsOi: buildActivityRows('PE', 'oi', contracts, liveMarketCache)
  }), [contracts, liveMarketCache]);
  const dashboardCharts = React.useMemo(() => buildDashboardCharts(contracts), [contracts]);
  const insights = buildDashboardInsights(nifty, bankNifty, dashboardCharts.oiChangeLeaders[0]?.symbol);
  const events = demoEvents();
  const topMovers = React.useMemo(
    () => [...filteredContracts].sort((a, b) => Math.abs(b.changePct) - Math.abs(a.changePct)).slice(0, 24),
    [filteredContracts]
  );
  const visibleContracts = contractView === 'top' ? topMovers : filteredContracts;
  const snapshotTiles = [
    { label: 'Regime', value: nifty.trend, tone: nifty.trend === 'Up' ? 'positive' : nifty.trend === 'Down' ? 'negative' : 'neutral' },
    { label: 'Median PCR', value: medianPcr.toString(), tone: medianPcr >= 1 ? 'positive' : 'negative' },
    { label: 'IV State', value: `${round((nifty.atmIv + bankNifty.atmIv) / 2, 1)}%`, tone: 'neutral' as const },
    { label: 'MWPL Watch', value: `${highMwpl} symbols`, tone: highMwpl >= 8 ? 'negative' : 'positive' },
    { label: 'Event Risk', value: `${events.length} events`, tone: events.length >= 3 ? 'negative' : 'neutral' }
  ] as const;
  const coverageCounts = getUpstoxCoverageCounts();
  const activeLiveSymbol = liveMarket?.mode === 'upstox_live' ? liveMarket.symbol : undefined;
  const liveUpdatedAt = liveMarket?.instrument.snapshotTs ?? latestUpdated ?? dataSource.generatedAt;
  const upstoxFeedRows = upstoxAnalyticsFeeds;
  const liveMarketInfoRows = getLiveMarketInformationRows(liveMarket?.marketInformation);

  return (
    <div className="page-stack">
      <header className="page-header">
        <div>
          <p className="eyebrow">Markets · Options dashboard</p>
          <h2>NSE F&O contracts</h2>
          <p className="subcopy">
            {dataMode === 'upstox_live'
              ? 'Upstox Analytics-powered FnO workspace with live option-chain, Greeks, OI, market-status, and trade discovery entry points.'
              : 'Excel-backed fallback universe with the same option-chain, PCR, OI, build-up, volatility, MWPL, and trade discovery structure.'}
          </p>
        </div>
        <div className="search-box">
          <Search size={17} />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search any FnO stock or index..." />
        </div>
      </header>

      <BeginnerFlowStrip />
      <ConceptStrip dataMode={dataMode} />

      <section className="market-overview-row">
        <IndexViewCard title="Nifty 50 Level" contract={nifty} onSelect={onSelectContract} />
        <IndexViewCard title="Bank Nifty Level" contract={bankNifty} onSelect={onSelectContract} />
        <div className="index-view-card">
          <p className="eyebrow">FII/DII Activity</p>
          <h3>Institutional flow</h3>
          <div className="fii-grid">
            <span><b>FII Cash</b><em className="negative">-₹1,240 Cr</em></span>
            <span><b>DII Cash</b><em className="positive">+₹1,870 Cr</em></span>
            <span><b>Index Fut</b><em className="positive">Long +6%</em></span>
            <span><b>Index Opt</b><em>Put hedge elevated</em></span>
          </div>
          <small>{dataMode === 'upstox_live' ? 'Market Information feed · context only, not a hard trade trigger' : 'Workbook fallback flow · not a hard trade trigger'}</small>
        </div>
      </section>

      <section className="snapshot-strip">
        {snapshotTiles.map((tile) => (
          <article key={tile.label} className={`snapshot-tile ${tile.tone}`}>
            <span>{tile.label}</span>
            <strong>{tile.value}</strong>
          </article>
        ))}
      </section>

      <section className="upstox-readiness-grid">
        <div className="market-panel live-data-card">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Upstox Analytics Token</p>
              <h3>Data readiness</h3>
            </div>
            <span className={`data-mode-pill ${dataMode === 'upstox_live' ? 'live' : 'demo'}`}>
              {dataMode === 'upstox_live' ? 'Live analytics' : 'Workbook fallback'}
            </span>
          </div>
          <div className="readiness-grid">
            <span><b>Market</b><em>{marketStatus ?? 'Not connected'}</em></span>
            <span><b>Active live symbol</b><em>{activeLiveSymbol ?? 'Fallback universe'}</em></span>
            <span><b>Last snapshot</b><em>{liveUpdatedAt?.slice(0, 16).replace('T', ' ')}</em></span>
            <span><b>Token scope</b><em>Read-only analytics</em></span>
          </div>
          <small>Execution, positions, holdings and user funds still require a separate trading/OAuth flow; this dashboard should treat the Analytics Token as market intelligence only.</small>
        </div>

        <div className="market-panel coverage-summary-card">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Coverage map</p>
              <h3>Available data points mapped to UX</h3>
            </div>
          </div>
          <div className="coverage-count-row">
            <span className="coverage-count covered"><b>{coverageCounts.covered}</b><em>Covered now</em></span>
            <span className="coverage-count partial"><b>{coverageCounts.partial}</b><em>Partial</em></span>
            <span className="coverage-count planned"><b>{coverageCounts.planned}</b><em>Next wiring</em></span>
          </div>
          <div className="source-chip-row">
            {upstoxDashboardCoverage.map((item) => <span key={item.title}>{item.title}</span>)}
          </div>
        </div>
      </section>

      <section className="dashboard-metrics">
        <Metric icon={<Activity size={18} />} label="FnO stocks" value={contracts.length.toString()} />
        <Metric icon={<Gauge size={18} />} label="Median PCR OI" value={medianPcr.toString()} />
        <Metric icon={<ListFilter size={18} />} label="MWPL above 80%" value={highMwpl.toString()} />
        <Metric icon={<ShieldCheck size={18} />} label="Mode" value={dataMode === 'upstox_live' ? 'Upstox live' : 'Workbook fallback'} />
      </section>

      <section className="dashboard-grid">
        <div className="market-panel large">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Most active option contracts</p>
              <h3>Pick a FnO stock or index to analyse</h3>
              <p className="subcopy">Selecting a symbol starts a 30-second live refresh loop through Supabase and the VPS quant service.</p>
            </div>
            <div className="range-pills">
              <button className={contractView === 'top' ? 'active' : ''} onClick={() => setContractView('top')}>Top movers</button>
              <button className={contractView === 'all' ? 'active' : ''} onClick={() => setContractView('all')}>All contracts</button>
              {(['All', 'Up', 'Down', 'Range', 'Volatile'] as const).map((trend) => (
                <button key={trend} className={trendFilter === trend ? 'active' : ''} onClick={() => setTrendFilter(trend)}>{trend}</button>
              ))}
            </div>
          </div>
          <div className="contract-table">
            <div className="contract-head">
              <span>Underlying</span><span>Expiry</span><span>Spot</span><span>PCR</span><span>IV</span><span>MWPL</span><span>Build-up</span><span />
            </div>
            {visibleContracts.length ? visibleContracts.map((contract) => (
              <button key={contract.id} className="contract-row" onClick={() => onSelectContract(contract)}>
                <strong>{contract.symbol}<small>{contract.name}</small></strong>
                <span>{contract.expiry}</span>
                <span>₹{contract.spot.toLocaleString('en-IN')} <em className={contract.changePct >= 0 ? 'positive' : 'negative'}>{contract.changePct}%</em></span>
                <span>{contract.pcr}</span>
                <span>{contract.atmIv}%</span>
                <span>{contract.mwpl ? `${contract.mwpl}%` : 'Index'}</span>
                <span>{contract.buildUp}</span>
                <ChevronRight size={16} />
              </button>
            )) : <div className="empty-state"><strong>No contracts found.</strong><span>Try changing trend filter or switch to All contracts.</span></div>}
          </div>
        </div>
      </section>

      <section className="activity-section">
        <ActivityWidget title="Most Active by Contract" subtitle="Calls" rows={activity.callsActive} onSelect={onSelectContract} />
        <ActivityWidget title="% Contract Gainers" subtitle="Calls" rows={activity.callsGainers} onSelect={onSelectContract} />
        <ActivityWidget title="% OI Gainers" subtitle="Calls" rows={activity.callsOi} onSelect={onSelectContract} />
        <ActivityWidget title="Most Active by Contract" subtitle="Puts" rows={activity.putsActive} onSelect={onSelectContract} />
        <ActivityWidget title="% Contract Gainers" subtitle="Puts" rows={activity.putsGainers} onSelect={onSelectContract} />
        <ActivityWidget title="% OI Gainers" subtitle="Puts" rows={activity.putsOi} onSelect={onSelectContract} />
      </section>

      <section className="tab-grid">
        <ActivityHeatmap
          title="Calls activity matrix"
          eyebrow="Visual scan"
          rows={[
            { label: 'Most active', values: activity.callsActive.slice(0, 5) },
            { label: 'Price gainers', values: activity.callsGainers.slice(0, 5) },
            { label: 'OI gainers', values: activity.callsOi.slice(0, 5) }
          ]}
          onSelect={onSelectContract}
        />
        <ActivityHeatmap
          title="Puts activity matrix"
          eyebrow="Visual scan"
          rows={[
            { label: 'Most active', values: activity.putsActive.slice(0, 5) },
            { label: 'Price gainers', values: activity.putsGainers.slice(0, 5) },
            { label: 'OI gainers', values: activity.putsOi.slice(0, 5) }
          ]}
          onSelect={onSelectContract}
        />
      </section>

      <section className="tab-grid">
        <div className="market-panel">
          <div className="panel-header"><div><p className="eyebrow">Today</p><h3>Insights and news</h3></div><Sparkles size={18} /></div>
          <div className="insight-list">
            {insights.map((insight) => <span key={insight}>{insight}</span>)}
          </div>
        </div>
        <div className="market-panel">
          <div className="panel-header"><div><p className="eyebrow">Calendar</p><h3>Events inside holding window</h3></div><Clock3 size={18} /></div>
          <div className="event-list">
            {events.map((event) => (
              <span key={`${event.date}-${event.title}`}><b>{event.date}</b><em>{event.title}</em><small>{event.impact} impact · {event.warning}</small></span>
            ))}
          </div>
        </div>
      </section>

      <section className="market-panel">
        <div className="panel-header">
          <div>
            <p className="eyebrow">Dynamic dashboard contract</p>
            <h3>How each Upstox data source powers the product</h3>
          </div>
          <span className="badge">Analytics Token scope</span>
        </div>
        <div className="upstox-feed-grid">
          {upstoxFeedRows.map((feed) => (
            <article key={feed.id} className="upstox-feed-card">
              <div>
                <span className={`coverage-status ${feed.status}`}>{feed.status}</span>
                <p className="eyebrow">{feed.category}</p>
                <h4>{feed.name}</h4>
              </div>
              <p>{feed.dashboardUse}</p>
              <div className="feed-meta-row">
                <span>{feed.cadence}</span>
                <span>{feed.mappedScreens.slice(0, 3).join(' · ')}</span>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="tab-grid">
        <div className="market-panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Market Information APIs</p>
              <h3>New dynamic blocks to wire next</h3>
            </div>
            <Activity size={18} />
          </div>
          <div className="live-info-strip">
            {liveMarketInfoRows.map((row) => (
              <span key={row.label}><b>{row.label}</b><em>{row.value}</em></span>
            ))}
          </div>
          <div className="market-info-ladder">
            {upstoxDashboardCoverage.map((item) => (
              <span key={item.title}>
                <b>{item.title}</b>
                <em>{item.value}</em>
                <small>{item.screens.join(' · ')}</small>
              </span>
            ))}
          </div>
        </div>

        <div className="market-panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Hierarchy additions</p>
              <h3>Missing screens recommended for MVP</h3>
            </div>
            <Layers3 size={18} />
          </div>
          <div className="screen-suggestion-list">
            {upstoxMissingScreenSuggestions.slice(0, 4).map((screen) => (
              <span key={screen.title}>
                <b>{screen.title}</b>
                <em>{screen.parent} · {screen.priority}</em>
                <small>{screen.purpose}</small>
              </span>
            ))}
          </div>
        </div>
      </section>

      <section className="dashboard-grid">
        <div className="market-panel span-2">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Index and market pulse</p>
              <h3>Quick read before choosing a contract</h3>
            </div>
            <span className="badge">{dataSource.workbook}</span>
          </div>
          <div className="index-pulse-grid">
            {dashboardCharts.indexCards.map((contract) => (
              <button key={contract.symbol} className="index-pulse" onClick={() => onSelectContract(contract as ContractSummary)}>
                <span>{contract.symbol}</span>
                <strong>₹{contract.spot.toLocaleString('en-IN')}</strong>
                <em className={contract.changePct >= 0 ? 'positive' : 'negative'}>{contract.changePct}% · PCR {contract.pcr}</em>
                <small>{contract.buildUp}</small>
              </button>
            ))}
          </div>
        </div>

        <ChartPanel title="PCR leaders" eyebrow="Options sentiment" badge="OI + Volume">
          <ResponsiveContainer width="100%" height={260}>
            <ComposedChart data={dashboardCharts.pcrLeaders}>
              <CartesianGrid stroke="#dfe6df" />
              <XAxis dataKey="symbol" interval={0} tick={{ fontSize: 11 }} />
              <YAxis />
              <Tooltip />
              <Bar dataKey="pcrOi" fill="#2d6f8f" name="PCR OI" />
              <Line dataKey="pcrVolume" stroke="#ad6b1d" strokeWidth={2} name="PCR Volume" />
            </ComposedChart>
          </ResponsiveContainer>
        </ChartPanel>

        <ChartPanel title="Build-up mix" eyebrow="Futures and options" badge="Contracts">
          <ResponsiveContainer width="100%" height={260}>
            <PieChart>
              <Pie data={dashboardCharts.buildupMix} dataKey="contracts" nameKey="bucket" cx="50%" cy="50%" outerRadius={86} label>
                {dashboardCharts.buildupMix.map((_, index) => <Cell key={index} fill={chartPalette[index % chartPalette.length]} />)}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </ChartPanel>

        <ChartPanel title="MWPL risk watch" eyebrow="Position limits" badge="Top 10">
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={dashboardCharts.mwplLeaders} layout="vertical" margin={{ left: 16, right: 16 }}>
              <CartesianGrid stroke="#dfe6df" />
              <XAxis type="number" />
              <YAxis dataKey="symbol" type="category" width={82} tick={{ fontSize: 11 }} />
              <Tooltip />
              <Bar dataKey="mwpl" fill="#b94f43" name="MWPL %" />
            </BarChart>
          </ResponsiveContainer>
        </ChartPanel>

        <ChartPanel title="OI change leaders" eyebrow="Participation" badge="Day change">
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={dashboardCharts.oiChangeLeaders}>
              <CartesianGrid stroke="#dfe6df" />
              <XAxis dataKey="symbol" interval={0} tick={{ fontSize: 11 }} />
              <YAxis />
              <Tooltip />
              <Bar dataKey="putOiChangePct" fill="#2f7d58" name="Put OI change %" />
              <Bar dataKey="callOiChangePct" fill="#d46b5b" name="Call OI change %" />
            </BarChart>
          </ResponsiveContainer>
        </ChartPanel>
      </section>

      <section className="tab-grid">
        <div className="market-panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Quick filters</p>
              <h3>Liquidity and event checks</h3>
            </div>
            <ListFilter size={18} />
          </div>
          <div className="filter-list">
            <span>FnO stock universe from workbook: {contracts.length} symbols</span>
            <span>OI, PCR, MWPL, rollover and volatility from F&O Stocks</span>
            <span>Option chain, IV, Greeks and build-up from F&O Data</span>
            <span>{dataMode === 'upstox_live' ? 'Bid/ask, IV and Greeks hydrate through Upstox option-chain rows' : 'Bid/ask spread is synthetic until Upstox quote fields are connected'}</span>
            <span>{liveLoadingSymbol ? `Refreshing ${liveLoadingSymbol} via VPS` : `Last sample update ${latestUpdated?.slice(0, 16).replace('T', ' ')}`}</span>
            {liveError ? <span>Live fallback note: {liveError}</span> : null}
          </div>
        </div>

        <div className="market-panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Research buckets</p>
              <h3>Available after selection</h3>
            </div>
          </div>
          <div className="bucket-list">
            {detailTabs.map((item) => (
              <span key={item.id}>{item.icon}{item.label}</span>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}

function ActivityHeatmap({
  title,
  eyebrow,
  rows,
  onSelect
}: {
  title: string;
  eyebrow: string;
  rows: Array<{ label: string; values: ReturnType<typeof buildActivityRows> }>;
  onSelect: (contract: ContractSummary) => void;
}) {
  return (
    <div className="market-panel">
      <div className="panel-header">
        <div>
          <p className="eyebrow">{eyebrow}</p>
          <h3>{title}</h3>
        </div>
      </div>
      <div className="activity-heatmap">
        {rows.map((row) => {
          const maxValue = Math.max(...row.values.map((item) => item.volume), 1);
          return (
            <div key={row.label} className="activity-heatmap-row">
              <span>{row.label}</span>
              <div>
                {row.values.map((item) => {
                  const intensity = Math.max(0.16, item.volume / maxValue);
                  return (
                    <button
                      key={`${item.symbol}-${item.type}-${item.strike}`}
                      className="activity-heat-cell"
                      style={{ background: `linear-gradient(180deg, rgba(47,125,88,${intensity}) 0%, rgba(47,125,88,0.08) 100%)` }}
                      onClick={() => onSelect(item.contract)}
                    >
                      <strong>{item.symbol}</strong>
                      <small>{item.strike} {item.type}</small>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function IndexViewCard({ title, contract, onSelect }: { title: string; contract: ContractSummary; onSelect: (contract: ContractSummary) => void }) {
  const sparkline = React.useMemo(
    () =>
      [-0.32, -0.14, 0.06, 0.24, -0.08, 0.16, contract.changePct].map((change, index) => ({
        time: index,
        value: round(contract.spot * (1 + change / 100), 2)
      })),
    [contract.changePct, contract.spot]
  );
  return (
    <button className="index-view-card clickable" onClick={() => onSelect(contract)}>
      <p className="eyebrow">{title}</p>
      <h3>{contract.symbol}</h3>
      <strong>₹{contract.spot.toLocaleString('en-IN')}</strong>
      <div className="index-sparkline">
        <ResponsiveContainer width="100%" height={56}>
          <AreaChart data={sparkline}>
            <defs>
              <linearGradient id={`spark-${contract.symbol}`} x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor="#2d6f8f" stopOpacity={0.35} />
                <stop offset="100%" stopColor="#2d6f8f" stopOpacity={0.05} />
              </linearGradient>
            </defs>
            <Area dataKey="value" stroke="#2d6f8f" fill={`url(#spark-${contract.symbol})`} strokeWidth={2} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <div className="index-meta">
        <span className={contract.changePct >= 0 ? 'positive' : 'negative'}>{contract.changePct}%</span>
        <span>PCR {contract.pcr}</span>
        <span>IV {contract.atmIv}%</span>
      </div>
      <small>{contract.buildUp} · OI change {contract.oiChangePct}%</small>
    </button>
  );
}

function ActivityWidget({ title, subtitle, rows, onSelect }: { title: string; subtitle: string; rows: ReturnType<typeof buildActivityRows>; onSelect: (contract: ContractSummary) => void }) {
  return (
    <div className="activity-widget">
      <p className="eyebrow">{subtitle}</p>
      <h3>{title}</h3>
      <div className="activity-list">
        {rows.slice(0, 5).map((row) => (
          <button key={`${row.symbol}-${row.type}-${row.strike}`} onClick={() => onSelect(row.contract)}>
            <strong>{row.symbol} {row.strike} {row.type}</strong>
            <span>₹{row.price} · OI {row.oiChangePct}% · Vol {row.volume.toLocaleString('en-IN')}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function CreateTradesWorkspace({
  activeContract,
  contracts,
  topTrades,
  tradeMatrix,
  onOpenContract,
  onAnalyseTrade
}: {
  activeContract: ContractSummary;
  contracts: ContractSummary[];
  topTrades: CandidateTrade[];
  tradeMatrix: Record<DirectionKey, CandidateTrade[]>;
  onOpenContract: (contract: ContractSummary, nextTab?: DetailTab) => void;
  onAnalyseTrade: (tradeId?: string) => void;
}) {
  const [theory, setTheory] = React.useState<DirectionKey>('rangebound');
  const theoryTrades = tradeMatrix[theory];
  const recommendedPath = activeContract.trend === 'Volatile' ? 'AI-led' : activeContract.trend === 'Range' ? 'Data-led' : 'Manual';

  return (
    <div className="page-stack">
      <header className="page-header">
        <div>
          <p className="eyebrow">Create Trades</p>
          <h2>One-time opportunity workspace</h2>
          <p className="subcopy">Start from AI, platform top trades, a market theory, a custom structure, or a screener row. Every path ends in Analyse Trade before paper trading.</p>
        </div>
        <div className="search-box">
          <Search size={17} />
          <select value={activeContract.symbol} onChange={(event) => onOpenContract(contracts.find((contract) => contract.symbol === event.target.value) ?? activeContract, 'overview')}>
            {contracts.slice(0, 120).map((contract) => <option key={contract.id}>{contract.symbol}</option>)}
          </select>
        </div>
      </header>

      <section className="market-panel recommended-path-card">
        <div className="panel-header">
          <div>
            <p className="eyebrow">Recommended path</p>
            <h3>{recommendedPath} flow for {activeContract.symbol}</h3>
          </div>
          <span className="badge">Smart default</span>
        </div>
        <p className="subcopy">
          {recommendedPath === 'AI-led'
            ? 'Current regime is volatile. Start from AI so entry, max loss, and exit get constrained first.'
            : recommendedPath === 'Data-led'
              ? 'Current regime is range-like. Start from top-scored range candidates and then refine.'
              : 'Current regime supports manual interpretation. Choose theory and profile, then inspect payoff.'}
        </p>
        <button className="wide-primary" onClick={() => onAnalyseTrade(topTrades[0]?.id)}>Start recommended flow</button>
      </section>

      <section className="newbie-assist-card">
        <div>
          <p className="eyebrow">New trader guardrail</p>
          <h3>Translate a view into a capped-risk trade</h3>
          <p>Say the view first: up, down, rangebound or volatile. Then choose defensive, neutral or aggressive. The product should always show max loss before paper trading.</p>
        </div>
        <div className="assist-chip-row">
          <span>Prefer spreads over naked selling</span>
          <span>Check liquidity before Greeks</span>
          <span>Analyse payoff before entry</span>
        </div>
      </section>

      <section className="trade-entry-grid">
        <div className="market-panel">
          <div className="panel-header"><div><p className="eyebrow">AI-led</p><h3>Ask AI for one trade</h3></div><Sparkles size={18} /></div>
          <p className="subcopy">Use the floating AI bubble in Create Trades mode. The AI will ask for view, max loss, entry, exit, and filters, then route to Analyse Trade.</p>
          <button className="wide-primary" onClick={() => onAnalyseTrade(topTrades[0]?.id)}><Target size={15} /> Use top candidate</button>
        </div>
        <div className="market-panel">
          <div className="panel-header"><div><p className="eyebrow">Data-led</p><h3>Pick platform Top 5</h3></div><ShieldCheck size={18} /></div>
          <div className="compact-trade-list">
            {topTrades.map((trade) => (
              <button key={trade.id} onClick={() => onAnalyseTrade(trade.id)}>
                <strong>{trade.strategy}</strong>
                <span>Score {trade.score} · POP {trade.pop}% · Max loss {rupee(trade.maxLoss)}</span>
              </button>
            ))}
          </div>
        </div>
        <div className="market-panel">
          <div className="panel-header"><div><p className="eyebrow">Manual</p><h3>Choose market theory</h3></div><Gauge size={18} /></div>
          <div className="direction-tabs compact">
            {directions.map((item) => (
              <button key={item.id} className={theory === item.id ? 'active' : ''} onClick={() => setTheory(item.id)}>
                {item.label}
                <small>{item.summary}</small>
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="market-panel">
        <div className="panel-header">
          <div>
            <p className="eyebrow">Theory trades</p>
            <h3>{directions.find((item) => item.id === theory)?.label} trades for {activeContract.symbol}</h3>
          </div>
          <span className="badge">Defensive · Neutral · Aggressive</span>
        </div>
        <div className="trade-profile-grid wide">
          {theoryTrades.map((trade, index) => (
            <button key={trade.id} className="trade-tile" onClick={() => onAnalyseTrade(trade.id)}>
              <span>{profiles[index]}</span>
              <strong>{trade.strategy}</strong>
              <em>{trade.thesis}</em>
              <MiniPayoffPreview trade={trade} />
              <b>{trade.score}</b>
            </button>
          ))}
        </div>
      </section>

      <section className="tab-grid">
        <div className="market-panel">
          <div className="panel-header"><div><p className="eyebrow">Other ways</p><h3>Custom trade builder</h3></div><PlusIcon /></div>
          <p className="subcopy">For the demo, custom build starts from the selected top candidate and lets the user edit legs inside Analyse Trade.</p>
          <button className="wide-primary" onClick={() => onAnalyseTrade(theoryTrades[1]?.id)}><PlayCircle size={15} /> Build custom trade</button>
        </div>
        <div className="market-panel">
          <div className="panel-header"><div><p className="eyebrow">Other ways</p><h3>Promote screener result</h3></div><ListFilter size={18} /></div>
          <p className="subcopy">Use Option Screener to find candidates by IV, OI, Greeks, liquidity, build-up, or technical conditions, then promote any row to Analyse Trade.</p>
          <button className="ghost-action" onClick={() => onOpenContract(activeContract, 'option-chain')}><Layers3 size={15} /> Inspect chain first</button>
        </div>
      </section>
    </div>
  );
}

function OptionScreener({
  contracts,
  liveMarketCache,
  onOpenContract,
  onAnalyseTrade
}: {
  contracts: ContractSummary[];
  liveMarketCache: LiveMarketCache;
  onOpenContract: (contract: ContractSummary, nextTab?: DetailTab) => void;
  onAnalyseTrade: (tradeId?: string) => void;
}) {
  const defaults = {
    universe: 'All FnO',
    expiry: 'Current Expiry',
    instrument: 'Calls + Puts',
    moneyness: 'ATM / Near OTM',
    iv: 'Any IV',
    liquidity: 'A or B',
    buildUp: 'Any Build Up'
  };
  const [filters, setFilters] = React.useState(defaults);
  const [showAdvanced, setShowAdvanced] = React.useState(false);
  const [viewMode, setViewMode] = React.useState<'table' | 'cards'>('table');
  const results = React.useMemo(() => buildScreenerResults(filters, contracts, liveMarketCache), [contracts, filters, liveMarketCache]);
  const querySummary = Object.entries(filters).filter(([, value]) => value && !String(value).startsWith('Any')).map(([key, value]) => `${labelize(key)} = ${value}`).join(' · ');
  const activeFilters = Object.entries(filters).filter(([key, value]) => value !== defaults[key as keyof typeof defaults]);
  const [instrumentType, setInstrumentType] = React.useState('Options');

  const update = (key: keyof typeof filters, value: string) => setFilters((current) => ({ ...current, [key]: value }));
  const clearFilter = (key: keyof typeof filters) => setFilters((current) => ({ ...current, [key]: defaults[key] }));

  return (
    <div className="page-stack">
      <header className="page-header">
        <div>
          <p className="eyebrow">Option Screener</p>
          <h2>Filter contracts without decoding the whole chain</h2>
          <p className="subcopy">Manually filter options by universe, expiry, moneyness, IV, OI, volume, build-up, Greeks, liquidity, technicals, and events. The AI bubble can convert natural language into these filters.</p>
        </div>
        <button className="wide-primary"><Sparkles size={15} /> Ask AI to fill filters</button>
      </header>

      <section className="newbie-assist-card compact-assist">
        <div>
          <p className="eyebrow">How to screen as a beginner</p>
          <h3>Start with tradeability, then add edge</h3>
          <p>Use liquidity, expiry and moneyness first. After that, add IV, OI change, build-up and Greeks so the result stays readable.</p>
        </div>
        <div className="assist-chip-row">
          <span>1. Liquid</span>
          <span>2. Near ATM</span>
          <span>3. Clear OI/IV signal</span>
        </div>
      </section>

      <section className="screener-panel">
        <div className="screener-toolbar">
          <SegmentedControl value={instrumentType} options={['Options', 'Futures']} onChange={(value) => setInstrumentType(value)} />
          <SegmentedControl value={viewMode === 'table' ? 'Table' : 'Cards'} options={['Table', 'Cards']} onChange={(value) => setViewMode(value === 'Cards' ? 'cards' : 'table')} />
          <div className="screener-toolbar-actions">
            <button className={showAdvanced ? 'active' : ''} onClick={() => setShowAdvanced((current) => !current)}>
              {showAdvanced ? 'Hide advanced' : 'Advanced filters'}
            </button>
            <button className="ghost-action" onClick={() => setFilters(defaults)}>Start afresh</button>
          </div>
        </div>
        <div className="screener-grid">
          <Field label="Stock Universe"><select value={filters.universe} onChange={(event) => update('universe', event.target.value)}><option>All FnO</option><option>Index Options</option><option>Banking</option><option>High MWPL</option></select></Field>
          <Field label="Expiry"><select value={filters.expiry} onChange={(event) => update('expiry', event.target.value)}><option>Current Expiry</option><option>Next Weekly</option><option>Current Month</option></select></Field>
          <Field label="Instrument"><select value={filters.instrument} onChange={(event) => update('instrument', event.target.value)}><option>Calls + Puts</option><option>Calls</option><option>Puts</option></select></Field>
          <Field label="ITM / OTM"><select value={filters.moneyness} onChange={(event) => update('moneyness', event.target.value)}><option>ATM / Near OTM</option><option>ITM</option><option>OTM</option><option>Delta 0.30-0.60</option></select></Field>
          <Field label="Liquidity"><select value={filters.liquidity} onChange={(event) => update('liquidity', event.target.value)}><option>A or B</option><option>A only</option><option>Spread below 2%</option><option>Volume above median</option></select></Field>
          {showAdvanced && (
            <>
              <Field label="IV"><select value={filters.iv} onChange={(event) => update('iv', event.target.value)}><option>Any IV</option><option>IV Rank below 30</option><option>IV Rank above 70</option><option>IV gainers</option></select></Field>
              <Field label="Build Up"><select value={filters.buildUp} onChange={(event) => update('buildUp', event.target.value)}><option>Any Build Up</option><option>Long Build Up</option><option>Short Build Up</option><option>Short Covering</option><option>Long Unwinding</option></select></Field>
            </>
          )}
        </div>
        <div className="active-filter-chips">
          {activeFilters.length === 0 ? <span className="query-chip">No extra filters applied</span> : activeFilters.map(([key, value]) => (
            <button key={key} className="query-chip" onClick={() => clearFilter(key as keyof typeof filters)}>
              {labelize(key)}: {value} ×
            </button>
          ))}
        </div>
        <div className="query-chip"><strong>Query:</strong> {querySummary || 'All current expiry FnO option contracts'} <button>Save</button></div>
      </section>

      <section className="market-panel">
        <div className="panel-header">
          <div><p className="eyebrow">Results</p><h3>{results.length} matching contracts</h3></div>
          <span className="badge">{Object.keys(liveMarketCache).length ? 'Live cache + fallback' : 'Workbook deterministic'}</span>
        </div>
        {results.length === 0 ? (
          <div className="empty-state">
            <strong>No contracts match this filter set.</strong>
            <span>Relax one or two filters (IV, moneyness, or liquidity) and try again.</span>
          </div>
        ) : viewMode === 'table' ? (
          <div className="screener-table">
            <div className="screener-head"><span>Symbol</span><span>Type</span><span>Strike</span><span>Price</span><span>OI</span><span>OI Chg</span><span>Volume</span><span>IV</span><span>Delta</span><span>Score</span><span>Action</span></div>
            {results.map((row) => (
              <div key={`${row.symbol}-${row.type}-${row.strike}`} className="screener-row">
                <strong>{row.symbol}<small>{row.name}</small></strong>
                <span>{row.type}</span>
                <span>{row.strike}</span>
                <span>₹{row.price}</span>
                <span>{row.oi.toLocaleString('en-IN')}</span>
                <span className={row.oiChange >= 0 ? 'positive' : 'negative'}>{row.oiChangePct}%</span>
                <span>{row.volume.toLocaleString('en-IN')}</span>
                <span>{row.iv}%</span>
                <span>{row.delta}</span>
                <span className={`screen-score ${row.liquidity === 'A' ? 'high' : row.liquidity === 'B' ? 'mid' : 'low'}`}>{row.liquidity}</span>
                <span className="row-actions">
                  <button title="Open chain" onClick={() => onOpenContract(row.contract, 'option-chain')}><Layers3 size={14} /></button>
                  <button title="Analyse trade" onClick={() => { onOpenContract(row.contract, 'quick-trades'); onAnalyseTrade(); }}><Target size={14} /></button>
                </span>
              </div>
            ))}
          </div>
        ) : (
          <div className="screener-card-grid">
            {results.map((row) => (
              <article key={`${row.symbol}-${row.type}-${row.strike}`} className="screener-result-card">
                <div>
                  <p className="eyebrow">{row.symbol} · {row.type}</p>
                  <h3>{row.strike}</h3>
                </div>
                <span className={`screen-score ${row.liquidity === 'A' ? 'high' : row.liquidity === 'B' ? 'mid' : 'low'}`}>{row.liquidity}</span>
                <p className="subcopy">₹{row.price} · OI {row.oi.toLocaleString('en-IN')} · IV {row.iv}% · Delta {row.delta}</p>
                <div className="row-actions">
                  <button onClick={() => onOpenContract(row.contract, 'option-chain')}><Layers3 size={14} /> Chain</button>
                  <button onClick={() => { onOpenContract(row.contract, 'quick-trades'); onAnalyseTrade(); }}><Target size={14} /> Analyse</button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function TradeAnalysisPage({ trade, instrument, contract, onBack }: { trade: CandidateTrade; instrument: Instrument; contract: ContractSummary; onBack: () => void }) {
  return (
    <div className="page-stack">
      <header className="contract-header">
        <button className="back-button" onClick={onBack}><ArrowLeft size={16} /> Back</button>
        <div className="contract-title">
          <p className="eyebrow">Analyse Trade</p>
          <h2>{contract.symbol} · {trade.strategy}</h2>
          <span>{contract.name} · {contract.expiry} · educational paper-trade analysis</span>
        </div>
        <div className="contract-actions">
          <details className="action-overflow">
            <summary>More</summary>
            <button>Save</button>
            <button>Run backtest</button>
          </details>
          <button>Review & Paper Trade</button>
        </div>
      </header>
      <StrategyAnalysis trade={trade} instrument={instrument} showAiPanel />
    </div>
  );
}

function ContractDetail({
  contract,
  instrument,
  chain,
  analytics,
  topTrades,
  tab,
  setTab,
  direction,
  setDirection,
  selectedTrade,
  selectedTradeId,
  setSelectedTradeId,
  activeTrades,
  onBack,
  onAnalyseTrade
}: {
  contract: ContractSummary;
  instrument: Instrument;
  chain: OptionQuote[];
  analytics: ChainAnalytics;
  topTrades: CandidateTrade[];
  tab: DetailTab;
  setTab: (tab: DetailTab) => void;
  direction: DirectionKey;
  setDirection: (direction: DirectionKey) => void;
  selectedTrade: CandidateTrade;
  selectedTradeId: string;
  setSelectedTradeId: (id: string) => void;
  activeTrades: CandidateTrade[];
  onBack: () => void;
  onAnalyseTrade: (tradeId?: string) => void;
}) {
  const [focusedStrike, setFocusedStrike] = React.useState<number | null>(null);
  const coreTabs = detailTabs.filter((item) => ['overview', 'option-chain', 'combined-oi'].includes(item.id));
  const analysisTabs = detailTabs.filter((item) => ['technicals', 'build-up', 'quick-trades'].includes(item.id));
  return (
    <div className="page-stack">
      <header className="contract-header">
        <button className="back-button" onClick={onBack}><ArrowLeft size={16} /> Contracts</button>
        <div className="contract-title">
          <p className="eyebrow">Selected option contract</p>
          <h2>{contract.symbol} · {contract.expiry}</h2>
          <span>{contract.name} · Lot {contract.lotSize} · Max pain {analytics.maxPain} · PCR {analytics.pcrOi}</span>
        </div>
        <div className="contract-actions">
          <button>Backtest</button>
          <button>Paper trade</button>
        </div>
      </header>

      <section className="contract-summary-strip" aria-label="Contract summary">
        <span><b>Spot</b><strong>₹{contract.spot.toLocaleString('en-IN')}</strong></span>
        <span><b>PCR</b><strong>{analytics.pcrOi}</strong></span>
        <span><b>ATM IV</b><strong>{analytics.atmIv}%</strong></span>
        <span><b>Max pain</b><strong>{analytics.maxPain}</strong></span>
        <span><b>Liquidity</b><strong>{analytics.liquidityScore}/100</strong></span>
      </section>

      <ContractDecisionGuide
        contract={contract}
        analytics={analytics}
        onQuickTrades={() => setTab('quick-trades')}
        onAnalyseTrade={() => onAnalyseTrade(topTrades[0]?.id)}
      />

      <nav className="detail-tabs grouped" aria-label="Contract details">
        <div className="detail-tab-group">
          <span>Market view</span>
          {coreTabs.map((item) => (
            <button key={item.id} className={tab === item.id ? 'active' : ''} onClick={() => setTab(item.id)}>
              {item.icon}{item.label}
            </button>
          ))}
        </div>
        <div className="detail-tab-group">
          <span>Signals and actions</span>
          {analysisTabs.map((item) => (
            <button key={item.id} className={tab === item.id ? 'active' : ''} onClick={() => setTab(item.id)}>
              {item.icon}{item.label}
            </button>
          ))}
        </div>
      </nav>

      {tab === 'overview' && <OverviewTab contract={contract} analytics={analytics} chain={chain} topTrades={topTrades} onAnalyseTrade={onAnalyseTrade} />}
      {tab === 'option-chain' && <OptionChainTab instrument={instrument} chain={chain} focusStrike={focusedStrike} />}
      {tab === 'combined-oi' && <CombinedOiTab chain={chain} onFocusStrike={(strike) => { setFocusedStrike(strike); setTab('option-chain'); }} />}
      {tab === 'technicals' && <TechnicalsTab contract={contract} />}
      {tab === 'build-up' && <BuildUpTab chain={chain} />}
      {tab === 'quick-trades' && (
        <FindTradesTab
          direction={direction}
          setDirection={setDirection}
          selectedTrade={selectedTrade}
          selectedTradeId={selectedTradeId}
          setSelectedTradeId={setSelectedTradeId}
          activeTrades={activeTrades}
          instrument={instrument}
          onAnalyseTrade={onAnalyseTrade}
        />
      )}
    </div>
  );
}

function OverviewTab({ contract, analytics, chain, topTrades, onAnalyseTrade }: { contract: ContractSummary; analytics: ChainAnalytics; chain: OptionQuote[]; topTrades: CandidateTrade[]; onAnalyseTrade: (tradeId?: string) => void }) {
  const positioning = [
    { axis: 'Put wall', value: analytics.putWall },
    { axis: 'Max pain', value: analytics.maxPain },
    { axis: 'Call wall', value: analytics.callWall }
  ];
  return (
    <section className="tab-grid">
      <div className="market-panel span-2">
        <div className="panel-header">
          <div>
            <p className="eyebrow">Overview</p>
            <h3>Market and option-chain summary</h3>
          </div>
          <span className="badge">{contract.trend}</span>
        </div>
        <div className="dashboard-metrics tight">
          <Metric icon={<TrendingUp size={18} />} label="Spot" value={`₹${contract.spot.toLocaleString('en-IN')}`} />
          <Metric icon={<Gauge size={18} />} label="PCR OI" value={contract.pcr.toString()} />
          <Metric icon={<Activity size={18} />} label="ATM IV" value={`${analytics.atmIv}%`} />
          <Metric icon={<Target size={18} />} label="Expected move" value={`±${round(analytics.expectedMoveStraddle)}`} />
        </div>
        <div className="overview-visual-grid">
          <article className="signal-card">
            <span>Support / resistance</span>
            <strong>{analytics.putWall} - {analytics.callWall}</strong>
            <small>Max pain at {analytics.maxPain}</small>
            <i><em style={{ width: `${Math.max(8, Math.min(100, (analytics.liquidityScore / 100) * 100))}%` }} /></i>
          </article>
          <article className="signal-card">
            <span>Volatility context</span>
            <strong>{analytics.atmIv}% ATM IV</strong>
            <small>Skew {analytics.skew} · Term slope {analytics.termSlope}</small>
            <i><em style={{ width: `${Math.max(8, Math.min(100, analytics.atmIv))}%` }} /></i>
          </article>
          <article className="signal-card">
            <span>Trade quality</span>
            <strong>{analytics.liquidityScore}/100</strong>
            <small>MWPL {contract.mwpl || 'Index'} · {contract.buildUp}</small>
            <i><em style={{ width: `${Math.max(8, analytics.liquidityScore)}%` }} /></i>
          </article>
        </div>
        <div className="positioning-compass">
          <div className="panel-header"><div><p className="eyebrow">Positioning compass</p><h3>Where option positioning is clustered</h3></div></div>
          <ResponsiveContainer width="100%" height={180}>
            <ComposedChart data={positioning}>
              <CartesianGrid stroke="#dfe6df" />
              <XAxis dataKey="axis" />
              <YAxis />
              <Tooltip />
              <Bar dataKey="value" fill="#2d6f8f" />
              <Line dataKey="value" stroke="#2f7d58" strokeWidth={2} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="market-panel">
        <div className="panel-header">
          <div>
            <p className="eyebrow">OI map</p>
            <h3>Walls</h3>
          </div>
        </div>
        <MiniOiChart chain={chain} />
      </div>

      <div className="market-panel span-2">
        <div className="panel-header">
          <div>
            <p className="eyebrow">Platform Top 5</p>
            <h3>Suggested trades from chain state, not chat</h3>
          </div>
          <span className="badge">Independent scoring</span>
        </div>
        <div className="top-trades-grid">
          {topTrades.map((trade) => (
            <button key={trade.id} className="top-trade-card" onClick={() => onAnalyseTrade(trade.id)}>
              <span>{trade.direction}</span>
              <strong>{trade.strategy}</strong>
              <div className="top-trade-kpis">
                <small>Score</small>
                <b>{trade.score}</b>
                <small>POP {trade.pop}%</small>
                <small>Loss {rupee(trade.maxLoss)}</small>
              </div>
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}

function OptionChainTab({ instrument, chain, focusStrike }: { instrument: Instrument; chain: OptionQuote[]; focusStrike?: number | null }) {
  const [groups, setGroups] = React.useState<OptionChainColumnGroup[]>(['Price', 'OI/Volume']);
  const [showAdvanced, setShowAdvanced] = React.useState(false);
  const strikes = uniqueStrikes(chain);
  const atm = getAtmStrike(chain, instrument.spot);

  const toggleGroup = (group: OptionChainColumnGroup) => {
    setGroups((current) => current.includes(group) ? current.filter((item) => item !== group) : [...current, group]);
  };

  const setPreset = (preset: 'scalping' | 'positional' | 'volatility') => {
    if (preset === 'scalping') setGroups(['Price', 'OI/Volume']);
    if (preset === 'positional') setGroups(['Price', 'OI/Volume', 'Greeks', 'Model Edge']);
    if (preset === 'volatility') setGroups(['Price', 'Volatility', 'Greeks']);
  };

  // Compile symmetrical column layouts
  const callCols: string[] = [];
  if (groups.includes('Greeks')) callCols.push('minmax(55px, 1fr)', 'minmax(55px, 1fr)');
  if (groups.includes('Model Edge')) callCols.push('minmax(50px, 1fr)', 'minmax(90px, 1.2fr)');
  if (groups.includes('Volatility')) callCols.push('minmax(50px, 1fr)');
  if (groups.includes('Futures')) callCols.push('minmax(60px, 1fr)', 'minmax(50px, 1fr)');
  if (groups.includes('OI/Volume')) callCols.push('minmax(90px, 1.3fr)', 'minmax(70px, 1fr)', 'minmax(80px, 1.1fr)');
  if (groups.includes('Price')) callCols.push('minmax(65px, 1fr)', 'minmax(75px, 1.1fr)');

  const putCols = [...callCols].reverse();
  const gridStyle = {
    display: 'grid',
    gridTemplateColumns: `${callCols.join(' ')} 90px ${putCols.join(' ')}`,
    gap: '6px',
    alignItems: 'center',
    textAlign: 'center' as const
  };

  return (
    <section className="market-panel option-chain-panel">
      <div className="panel-header">
        <div>
          <p className="eyebrow">Option Chain</p>
          <h3>Symmetrical chain view with highlighted strikes</h3>
        </div>
        <div className="range-pills"><button className="active">Live</button><button>15m</button><button>1h</button></div>
      </div>
      <div className="chain-preset-row">
        <span>Presets</span>
        <button onClick={() => setPreset('scalping')}>Scalping</button>
        <button onClick={() => setPreset('positional')}>Positional</button>
        <button onClick={() => setPreset('volatility')}>Volatility</button>
        <button className={showAdvanced ? 'active' : ''} onClick={() => setShowAdvanced((current) => !current)}>
          {showAdvanced ? 'Hide advanced columns' : 'Add columns'}
        </button>
      </div>
      <div className="column-group-bar">
        {(showAdvanced ? optionChainGroups : optionChainGroups.filter((group) => ['Price', 'OI/Volume'].includes(group))).map((group) => (
          <button key={group} className={groups.includes(group) ? 'active' : ''} onClick={() => toggleGroup(group)}>{group}</button>
        ))}
      </div>
      
      <div className="option-chain-table professional-table">
        {focusStrike ? <div className="chain-focus-chip">Focused strike {focusStrike}</div> : null}
        
        {/* Symmetric Header Labels */}
        <div className="chain-main-header" style={gridStyle}>
          {callCols.length > 0 ? (
            <div className="header-label calls-label" style={{ gridColumn: `span ${callCols.length}` }}>CALLS</div>
          ) : null}
          <div className="header-label strike-label" style={{ gridColumn: 'span 1' }}>STRIKE</div>
          {putCols.length > 0 ? (
            <div className="header-label puts-label" style={{ gridColumn: `span ${putCols.length}` }}>PUTS</div>
          ) : null}
        </div>

        {/* Column headings */}
        <div className="option-chain-head" style={gridStyle}>
          {/* Call Columns */}
          {groups.includes('Greeks') && <><span>Delta</span><span>Theta</span></>}
          {groups.includes('Model Edge') && <><span>POP%</span><span>Build Up</span></>}
          {groups.includes('Volatility') && <><span>IV</span></>}
          {groups.includes('Futures') && <><span>Basis</span><span>CoC</span></>}
          {groups.includes('OI/Volume') && <><span>OI</span><span>OI Chg%</span><span>Volume</span></>}
          {groups.includes('Price') && <><span>Chg%</span><span>LTP</span></>}
          
          {/* Center Column */}
          <span className="sticky-col strike">Strike</span>
          
          {/* Put Columns */}
          {groups.includes('Price') && <><span>LTP</span><span>Chg%</span></>}
          {groups.includes('OI/Volume') && <><span>Volume</span><span>OI Chg%</span><span>OI</span></>}
          {groups.includes('Futures') && <><span>CoC</span><span>Basis</span></>}
          {groups.includes('Volatility') && <><span>IV</span></>}
          {groups.includes('Model Edge') && <><span>Build Up</span><span>POP%</span></>}
          {groups.includes('Greeks') && <><span>Theta</span><span>Delta</span></>}
        </div>

        {/* Option Rows */}
        {strikes.map((strike) => {
          const ce = getQuote(chain, strike, 'CE');
          const pe = getQuote(chain, strike, 'PE');
          const ceDev = ce ? optionQuoteRow(instrument, ce) : null;
          const peDev = pe ? optionQuoteRow(instrument, pe) : null;
          
          const isAtm = strike === atm;
          const isFocused = strike === focusStrike;
          
          const isCallItm = strike < instrument.spot;
          const isPutItm = strike > instrument.spot;

          return (
            <div 
              key={strike} 
              className={`option-chain-row ${isAtm ? 'atm' : ''} ${isFocused ? 'focus' : ''}`}
              style={gridStyle}
            >
              {/* Call Columns */}
              {groups.includes('Greeks') && (
                <>
                  <span className={isCallItm ? 'itm-shaded' : ''}>{ce ? round(ce.delta, 3) : '-'}</span>
                  <span className={isCallItm ? 'itm-shaded' : ''}>{ce ? round(ce.theta, 3) : '-'}</span>
                </>
              )}
              {groups.includes('Model Edge') && (
                <>
                  <span className={isCallItm ? 'itm-shaded' : ''}>{ceDev ? `${ceDev.pop}%` : '-'}</span>
                  <span className={`buildup-badge ${ceDev?.buildUp.replace(/\s+/g, '-').toLowerCase()} ${isCallItm ? 'itm-shaded' : ''}`}>
                    {ceDev ? ceDev.buildUp : '-'}
                  </span>
                </>
              )}
              {groups.includes('Volatility') && <span className={isCallItm ? 'itm-shaded' : ''}>{ce ? `${round(ce.iv * 100, 1)}%` : '-'}</span>}
              {groups.includes('Futures') && (
                <>
                  <span className={isCallItm ? 'itm-shaded' : ''}>{ceDev ? ceDev.basis : '-'}</span>
                  <span className={isCallItm ? 'itm-shaded' : ''}>{ceDev ? `${ceDev.coc}%` : '-'}</span>
                </>
              )}
              {groups.includes('OI/Volume') && (
                <>
                  <span className={`oi-cell ${isCallItm ? 'itm-shaded' : ''}`}>
                    {ce ? ce.oi.toLocaleString('en-IN') : '-'}
                    {ce && <i><em style={{ width: `${Math.min(100, Math.max(6, ce.oi / 9000))}%` }} /></i>}
                  </span>
                  <span className={`${ceDev && ceDev.oiChangePct >= 0 ? 'positive' : 'negative'} ${isCallItm ? 'itm-shaded' : ''}`}>
                    {ceDev ? `${ceDev.oiChangePct}%` : '-'}
                  </span>
                  <span className={isCallItm ? 'itm-shaded' : ''}>{ce ? ce.volume.toLocaleString('en-IN') : '-'}</span>
                </>
              )}
              {groups.includes('Price') && (
                <>
                  <span className={`${ceDev && ceDev.dayChangePct >= 0 ? 'positive' : 'negative'} ${isCallItm ? 'itm-shaded' : ''}`}>
                    {ceDev ? `${ceDev.dayChangePct}%` : '-'}
                  </span>
                  <span className={`ltp-cell ${isCallItm ? 'itm-shaded' : ''}`}>₹{ce ? ce.ltp : '-'}</span>
                </>
              )}

              {/* Center Strike Column */}
              <strong className={`sticky-col strike ${isAtm ? 'atm-strike' : ''}`}>{strike}</strong>

              {/* Put Columns */}
              {groups.includes('Price') && (
                <>
                  <span className={`ltp-cell ${isPutItm ? 'itm-shaded' : ''}`}>₹{pe ? pe.ltp : '-'}</span>
                  <span className={`${peDev && peDev.dayChangePct >= 0 ? 'positive' : 'negative'} ${isPutItm ? 'itm-shaded' : ''}`}>
                    {peDev ? `${peDev.dayChangePct}%` : '-'}
                  </span>
                </>
              )}
              {groups.includes('OI/Volume') && (
                <>
                  <span className={isPutItm ? 'itm-shaded' : ''}>{pe ? pe.volume.toLocaleString('en-IN') : '-'}</span>
                  <span className={`${peDev && peDev.oiChangePct >= 0 ? 'positive' : 'negative'} ${isPutItm ? 'itm-shaded' : ''}`}>
                    {peDev ? `${peDev.oiChangePct}%` : '-'}
                  </span>
                  <span className={`oi-cell ${isPutItm ? 'itm-shaded' : ''}`}>
                    {pe ? pe.oi.toLocaleString('en-IN') : '-'}
                    {pe && <i><em style={{ width: `${Math.min(100, Math.max(6, pe.oi / 9000))}%` }} /></i>}
                  </span>
                </>
              )}
              {groups.includes('Futures') && (
                <>
                  <span className={isPutItm ? 'itm-shaded' : ''}>{peDev ? `${peDev.coc}%` : '-'}</span>
                  <span className={isPutItm ? 'itm-shaded' : ''}>{peDev ? peDev.basis : '-'}</span>
                </>
              )}
              {groups.includes('Volatility') && <span className={isPutItm ? 'itm-shaded' : ''}>{pe ? `${round(pe.iv * 100, 1)}%` : '-'}</span>}
              {groups.includes('Model Edge') && (
                <>
                  <span className={`buildup-badge ${peDev?.buildUp.replace(/\s+/g, '-').toLowerCase()} ${isPutItm ? 'itm-shaded' : ''}`}>
                    {peDev ? peDev.buildUp : '-'}
                  </span>
                  <span className={isPutItm ? 'itm-shaded' : ''}>{peDev ? `${peDev.pop}%` : '-'}</span>
                </>
              )}
              {groups.includes('Greeks') && (
                <>
                  <span className={isPutItm ? 'itm-shaded' : ''}>{pe ? round(pe.theta, 3) : '-'}</span>
                  <span className={isPutItm ? 'itm-shaded' : ''}>{pe ? round(pe.delta, 3) : '-'}</span>
                </>
              )}
            </div>
          );
        })}
        {strikes.length === 0 ? <div className="empty-state"><strong>No option chain rows.</strong><span>Change selected expiry or refresh quote source.</span></div> : null}
      </div>
    </section>
  );
}

function CombinedOiTab({ chain, onFocusStrike }: { chain: OptionQuote[]; onFocusStrike: (strike: number) => void }) {
  const data = combinedOiData(chain);
  const strongestCall = [...data].sort((a, b) => b.callOi - a.callOi)[0];
  const strongestPut = [...data].sort((a, b) => b.putOi - a.putOi)[0];
  const maxTotal = [...data].sort((a, b) => b.total - a.total)[0];
  return (
    <section className="tab-grid">
      <div className="market-panel span-2">
        <div className="panel-header">
          <div>
            <p className="eyebrow">Combined OI</p>
            <h3>Strike-wise CE + PE concentration</h3>
          </div>
          <div className="range-pills"><button className="active">15m</button><button>1h</button><button>Day</button></div>
        </div>
        <div className="delta-card-row">
          <button onClick={() => onFocusStrike(strongestCall.strike)}><span>Call wall</span><strong>{strongestCall.strike}</strong></button>
          <button onClick={() => onFocusStrike(strongestPut.strike)}><span>Put wall</span><strong>{strongestPut.strike}</strong></button>
          <button onClick={() => onFocusStrike(maxTotal.strike)}><span>Max concentration</span><strong>{maxTotal.strike}</strong></button>
        </div>
        <ResponsiveContainer width="100%" height={330}>
          <ComposedChart data={data}>
            <CartesianGrid stroke="#dfe6df" />
            <XAxis dataKey="strike" />
            <YAxis />
            <Tooltip />
            <Bar dataKey="callOi" fill="#d46b5b" />
            <Bar dataKey="putOi" fill="#3d8a62" />
            <Line dataKey="total" stroke="#2d6f8f" strokeWidth={2} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <div className="market-panel">
        <div className="panel-header"><div><p className="eyebrow">Readout</p><h3>What changed</h3></div></div>
        <InfoBlock title="OI interpretation" items={[`Fresh call concentration at ${strongestCall.strike}`, `Put base visible at ${strongestPut.strike}`, `Total OI concentration near ${maxTotal.strike}`]} />
      </div>
    </section>
  );
}

function TechnicalsTab({ contract }: { contract: ContractSummary }) {
  const signalCards = [
    { label: 'Trend', value: contract.trend, state: contract.buildUp, tone: contract.trend === 'Up' ? 'positive' : contract.trend === 'Down' ? 'negative' : 'neutral' },
    { label: 'OI change', value: `${contract.oiChangePct}%`, state: 'Total open interest', tone: contract.oiChangePct >= 0 ? 'positive' : 'negative' },
    { label: 'PCR OI', value: contract.pcr.toString(), state: 'Put-call positioning', tone: contract.pcr >= 1 ? 'positive' : 'negative' },
    { label: 'MWPL', value: contract.mwpl ? `${contract.mwpl}%` : 'Index', state: 'Position-limit risk', tone: (contract.mwpl ?? 0) >= 80 ? 'negative' : 'neutral' },
    { label: 'Volatility', value: `${round(contract.annualizedVolatility * 100, 1)}%`, state: 'Annualized', tone: 'neutral' as const }
  ];
  return (
    <section className="tab-grid">
      <div className="market-panel span-2">
        <div className="panel-header">
          <div>
            <p className="eyebrow">Technicals</p>
            <h3>Underlying and futures signal stack</h3>
          </div>
          <div className="range-pills"><button>5m</button><button className="active">15m</button><button>1h</button><button>1d</button></div>
        </div>
        <ResponsiveContainer width="100%" height={300}>
          <ComposedChart data={technicalData(contract)}>
            <CartesianGrid stroke="#dfe6df" />
            <XAxis dataKey="time" />
            <YAxis />
            <Tooltip />
            <Bar dataKey="volume" fill="#dceaf0" />
            <Area dataKey="price" stroke="#2d6f8f" fill="#dceaf0" />
            <Line dataKey="signal" stroke="#2f7d58" strokeWidth={2} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <div className="market-panel">
        <div className="panel-header"><div><p className="eyebrow">Signal confidence</p><h3>Interpretation cards</h3></div></div>
        <div className="signal-traffic-grid">
          {signalCards.map((card) => (
            <article key={card.label} className={`signal-traffic-card ${card.tone}`}>
              <span>{card.label}</span>
              <strong>{card.value}</strong>
              <small>{card.state}</small>
            </article>
          ))}
        </div>
        <p className="subcopy">Bias remains {contract.trend.toLowerCase()} with {contract.buildUp.toLowerCase()} context; use OI and IV together before selecting directional structures.</p>
      </div>
    </section>
  );
}

function BuildUpTab({ chain }: { chain: OptionQuote[] }) {
  const rows = buildUpRows(chain);
  const [interval, setInterval] = React.useState<'15m' | '30m' | 'day'>('15m');
  const dominant = rows[3]?.[2] ?? '';
  return (
    <section className="market-panel">
      <div className="panel-header">
        <div>
          <p className="eyebrow">Build Up</p>
          <h3>Price and OI behaviour by bucket</h3>
        </div>
        <div className="range-pills">
          <button className={interval === '15m' ? 'active' : ''} onClick={() => setInterval('15m')}>15m</button>
          <button className={interval === '30m' ? 'active' : ''} onClick={() => setInterval('30m')}>30m</button>
          <button className={interval === 'day' ? 'active' : ''} onClick={() => setInterval('day')}>Day</button>
        </div>
      </div>
      <div className="build-up-quadrant">
        {rows.map(([title, rule, read]) => (
          <article key={title}>
            <strong>{title}</strong>
            <span>{rule}</span>
            <p>{read}</p>
          </article>
        ))}
      </div>
      <div className="delta-card-row build-up-delta">
        <button><span>Interval</span><strong>{interval.toUpperCase()}</strong></button>
        <button><span>Dominant side</span><strong>{dominant.replace(' positioning is stronger', '')}</strong></button>
        <button><span>Interpretation</span><strong>Use with trend and IV</strong></button>
      </div>
    </section>
  );
}

function FindTradesTab({
  direction,
  setDirection,
  selectedTrade,
  selectedTradeId,
  setSelectedTradeId,
  activeTrades,
  instrument,
  onAnalyseTrade
}: {
  direction: DirectionKey;
  setDirection: (direction: DirectionKey) => void;
  selectedTrade: CandidateTrade;
  selectedTradeId: string;
  setSelectedTradeId: (id: string) => void;
  activeTrades: CandidateTrade[];
  instrument: Instrument;
  onAnalyseTrade: (tradeId?: string) => void;
}) {
  const [riskProfile, setRiskProfile] = React.useState<RiskProfile>('Neutral');
  const profileIndex = profiles.indexOf(riskProfile);
  const featuredTrade = activeTrades[Math.max(0, profileIndex)] ?? selectedTrade;
  return (
    <section className="find-trade-layout">
      <div className="market-panel">
        <div className="panel-header">
          <div>
            <p className="eyebrow">Quick Options</p>
            <h3>Quick Trades by market view</h3>
          </div>
          <span className="badge">Guided flow</span>
        </div>
        <div className="trade-stepper">
          <span className="active">1. Choose view</span>
          <span className="active">2. Pick risk profile</span>
          <span>3. Inspect candidate</span>
        </div>
        <div className="direction-tabs">
          {directions.map((item) => (
            <button key={item.id} className={direction === item.id ? 'active' : ''} onClick={() => setDirection(item.id)}>
              {item.label}
              <small>{item.summary}</small>
            </button>
          ))}
        </div>
        <div className="risk-profile-row">
          {profiles.map((profile) => (
            <button key={profile} className={riskProfile === profile ? 'active' : ''} onClick={() => setRiskProfile(profile)}>
              {profile}
            </button>
          ))}
        </div>
        <div className="trade-profile-grid">
          {activeTrades.map((trade, index) => (
            <button
              key={trade.id}
              className={`trade-tile ${selectedTradeId === trade.id ? 'active' : ''}`}
              onClick={() => setSelectedTradeId(trade.id)}
            >
              <span>{profiles[index]}</span>
              <strong>{trade.strategy}</strong>
              <em>{trade.title}</em>
              <MiniPayoffPreview trade={trade} />
              <b>{trade.score}</b>
            </button>
          ))}
        </div>
        <div className="featured-trade-card">
          <p className="eyebrow">Selected profile recommendation</p>
          <h3>{riskProfile} · {featuredTrade.strategy}</h3>
          <p className="subcopy">{featuredTrade.thesis}</p>
          <button className="wide-primary" onClick={() => setSelectedTradeId(featuredTrade.id)}>Inspect this candidate</button>
        </div>
      </div>

      <StrategyAnalysis trade={selectedTrade} instrument={instrument} onAnalyseTrade={() => onAnalyseTrade(selectedTrade.id)} />
    </section>
  );
}

function StrategyAnalysis({ trade, instrument, showAiPanel = false, onAnalyseTrade }: { trade: CandidateTrade; instrument: Instrument; showAiPanel?: boolean; onAnalyseTrade?: () => void }) {
  const [backtest, setBacktest] = React.useState<null | { winRate: number; profitFactor: number; drawdown: number; trades: number }>(null);
  const [paperState, setPaperState] = React.useState<'idle' | 'open'>('idle');
  const [spotShift, setSpotShift] = React.useState(0);
  const greeks = aggregateGreeks(trade.legs, instrument.lotSize);
  const baseSpot = instrument.spot * (1 + spotShift / 100);
  const scenarios = [-2, -1, 0, 1, 2].map((shock) => {
    const target = baseSpot * (1 + shock / 100);
    const nearest = trade.payoff.reduce((closest, point) => (Math.abs(point.spot - target) < Math.abs(closest.spot - target) ? point : closest), trade.payoff[0]);
    return { shock: `${shock > 0 ? '+' : ''}${shock}%`, pnl: nearest.pnl };
  });
  const verdict = trade.score >= 78 && trade.pop >= 55 ? 'Good to trade' : trade.score >= 65 ? 'Review before entry' : 'Avoid for now';
  const verdictTone = verdict === 'Good to trade' ? 'good' : verdict === 'Review before entry' ? 'warn' : 'risk';

  return (
    <div className="strategy-builder">
      <div className="builder-left">
        <div className={`trade-verdict ${verdictTone}`}>
          <span>Decision</span>
          <strong>{verdict}</strong>
          <small>Score {trade.score} · POP {trade.pop}% · Max loss {rupee(trade.maxLoss)}</small>
        </div>
        <div className="panel-header">
          <div>
            <p className="eyebrow">Strategy Builder</p>
            <h3>{trade.title}</h3>
          </div>
          <span className="score-pill">{trade.score}</span>
        </div>
        <p className="subcopy">{trade.thesis}</p>
        <div className="legs-builder">
          {trade.legs.map((leg) => (
            <div key={leg.id} className="builder-leg">
              <span className={leg.side === 'BUY' ? 'buy' : 'sell'}>{leg.side}</span>
              <strong>{leg.strike} {leg.type}</strong>
              <small>Lot {leg.quantity}</small>
              <b>₹{leg.premium}</b>
            </div>
          ))}
        </div>
        <div className="quality-ribbons">
          <span className="quality-good">Defined risk</span>
          {trade.qualityFlags.length ? trade.qualityFlags.map((flag) => <span key={flag.code} className={`quality-${flag.severity}`}>{flag.label}</span>) : <span className="quality-good">Quote checks green</span>}
        </div>
        <div className="builder-actions">
          <button><PlayCircle size={15} /> Analyse</button>
          <button onClick={() => setPaperState('open')}><ShieldCheck size={15} /> {paperState === 'open' ? 'Paper Open' : 'Paper trade'}</button>
          {onAnalyseTrade && <button onClick={onAnalyseTrade}><ChevronRight size={15} /> Full view</button>}
        </div>
      </div>

      <div className="builder-main">
        <div className="risk-strip">
          <Metric icon={<TrendingUp size={17} />} label="Max profit" value={rupee(trade.maxProfit)} />
          <Metric icon={<TrendingDown size={17} />} label="Max loss" value={rupee(trade.maxLoss)} />
          <Metric icon={<Zap size={17} />} label="Net premium" value={rupee(trade.netPremium)} />
          <Metric icon={<Target size={17} />} label="POP" value={`${trade.pop}%`} />
        </div>
        <div className="breakeven-strip"><strong>Breakevens</strong><span>{trade.breakevens.map((b) => round(b, 1)).join(', ') || 'N/A'}</span></div>
        <div className="spot-slider-row">
          <span>Spot shift</span>
          <input type="range" min={-2} max={2} step={0.5} value={spotShift} onChange={(event) => setSpotShift(Number(event.target.value))} />
          <strong>{spotShift > 0 ? '+' : ''}{spotShift}%</strong>
        </div>
        <ResponsiveContainer width="100%" height={260}>
          <AreaChart data={trade.payoff}>
            <CartesianGrid stroke="#dfe6df" />
            <XAxis dataKey="spot" />
            <YAxis />
            <Tooltip formatter={(value: number) => rupee(value)} />
            <Area dataKey="pnl" stroke="#2f7d58" fill="#dceee3" />
          </AreaChart>
        </ResponsiveContainer>
        <div className="analysis-grid">
          <InfoBlock title="Net Greeks" items={[`Delta ${round(greeks.delta, 1)}`, `Gamma ${round(greeks.gamma, 2)}`, `Theta ${round(greeks.theta, 1)}`, `Vega ${round(greeks.vega, 1)}`]} />
          <div>
            <h4>Scenario P/L</h4>
            <div className="scenario-table">
              {scenarios.map((item) => (
                <span key={item.shock}><b>{item.shock}</b>{rupee(item.pnl)}</span>
              ))}
            </div>
          </div>
          <div>
            <h4>Score breakdown</h4>
            <div className="score-breakdown">
              {[...scoreKeys].sort((a, b) => trade.scoreBreakdown[b] - trade.scoreBreakdown[a]).map((key) => (
                <div key={key}>
                  <span title={`Threshold: ${trade.scoreBreakdown[key] >= 75 ? 'Strong' : trade.scoreBreakdown[key] >= 60 ? 'Watch' : 'Weak'}`}>{labelize(key)}</span>
                  <i><b style={{ width: `${trade.scoreBreakdown[key]}%` }} /></i>
                  <em>{trade.scoreBreakdown[key]} · {trade.scoreBreakdown[key] >= 75 ? 'Strong' : trade.scoreBreakdown[key] >= 60 ? 'Watch' : 'Weak'}</em>
                </div>
              ))}
            </div>
          </div>
          <div>
            <h4>Demo backtest</h4>
            {backtest ? (
              <div className="scenario-table">
                <span><b>Trades</b>{backtest.trades}</span>
                <span><b>Win rate</b>{backtest.winRate}%</span>
                <span><b>PF</b>{backtest.profitFactor}</span>
                <span><b>DD</b>{backtest.drawdown}%</span>
              </div>
            ) : (
              <button className="ghost-action" onClick={() => setBacktest({ trades: 18, winRate: 61.1, profitFactor: 1.46, drawdown: 6.4 })}><PlayCircle size={15} /> Run demo backtest</button>
            )}
          </div>
        </div>
      </div>
      {showAiPanel && (
        <aside className="trade-ai-panel">
          <div className="panel-header"><div><p className="eyebrow">AI Optimise</p><h3>Refine safely</h3></div><Bot size={18} /></div>
          {['Explain trade', 'Reduce max loss', 'Improve liquidity', 'Convert to defined risk', 'Add hedge', 'Compare similar'].map((action) => (
            <button key={action}>{action}</button>
          ))}
          <div className="ai-diff-card">
            <strong>Suggested diff</strong>
            <span>Move short strikes one step farther and keep wings fixed. Max loss falls; credit and POP also reduce.</span>
            <button>Approve suggestion</button>
          </div>
        </aside>
      )}
    </div>
  );
}

function CreateAlgoWorkspace({
  config,
  setConfig,
  aiDraft,
  selectedContract,
  contracts,
  onApplyAiDraft
}: {
  config: AlgoStrategyConfig;
  setConfig: React.Dispatch<React.SetStateAction<AlgoStrategyConfig>>;
  aiDraft: ReturnType<typeof draftFromChat>;
  selectedContract: ContractSummary;
  contracts: ContractSummary[];
  onApplyAiDraft: () => void;
}) {
  const [stage, setStage] = React.useState<1 | 2 | 3 | 4>(1);
  const update = <K extends keyof AlgoStrategyConfig>(key: K, value: AlgoStrategyConfig[K]) => {
    setConfig((current) => ({ ...current, [key]: value }));
  };
  const updateCondition = (kind: 'entryConditions' | 'exitConditions', index: number, patch: Partial<SignalCondition>) => {
    setConfig((current) => ({
      ...current,
      [kind]: current[kind].map((condition, i) => (i === index ? { ...condition, ...patch } : condition))
    }));
  };
  const addCondition = (kind: 'entryConditions' | 'exitConditions') => {
    setConfig((current) => ({
      ...current,
      [kind]: [...current[kind], { id: `${kind}-${Date.now()}`, left: 'Current Close', operator: 'Is Above', right: 'sma' }]
    }));
  };
  const updateLeg = (index: number, patch: Partial<AlgoLegConfig>) => {
    setConfig((current) => ({
      ...current,
      legs: current.legs.map((leg, i) => (i === index ? { ...leg, ...patch } : leg))
    }));
  };
  const addLeg = () => {
    if (config.legs.length >= 4) return;
    setConfig((current) => ({
      ...current,
      legs: [
        ...current.legs,
        {
          ...current.legs[current.legs.length - 1],
          id: `leg-${Date.now()}`,
          side: current.legs.length % 2 === 0 ? 'Sell' : 'Buy',
          optionType: current.legs.length % 2 === 0 ? 'CE' : 'PE'
        }
      ]
    }));
  };

  return (
    <div className="page-stack">
      <header className="page-header algo-page-header">
        <div>
          <p className="eyebrow">Create Algo · Strategy Builder</p>
          <h2>Create options strategy</h2>
          <p className="subcopy">Build manually or let the AI draft the run settings, indicators, entry and exit cases, option legs, expiry, and risk controls.</p>
        </div>
        <div className="builder-actions">
          <button onClick={onApplyAiDraft}><Sparkles size={15} /> Fill with AI draft</button>
          <button><PlayCircle size={15} /> Validate strategy</button>
        </div>
      </header>
      <section className="newbie-assist-card compact-assist">
        <div>
          <p className="eyebrow">Algo strategy route</p>
          <h3>Make the strategy repeatable before making it complex</h3>
          <p>For the MVP, a good first algo has one instrument, one primary signal, one exit rule and defined-risk option legs. AI can draft the form, but validation and backtest are mandatory.</p>
        </div>
        <div className="assist-chip-row">
          <span>Instrument</span>
          <span>Indicator</span>
          <span>Entry + exit</span>
          <span>Legs + risk</span>
        </div>
      </section>
      <section className="algo-template-row">
        <button onClick={() => update('runName', `${selectedContract.symbol} Range Template`)}>Range template</button>
        <button onClick={() => update('runName', `${selectedContract.symbol} Breakout Template`)}>Breakout template</button>
        <button onClick={() => update('runName', `${selectedContract.symbol} Mean Reversion Template`)}>Mean reversion template</button>
      </section>
      <section className="algo-stage-row">
        <button className={stage === 1 ? 'active' : ''} onClick={() => setStage(1)}>1. Setup</button>
        <button className={stage === 2 ? 'active' : ''} onClick={() => setStage(2)}>2. Signals</button>
        <button className={stage === 3 ? 'active' : ''} onClick={() => setStage(3)}>3. Legs & Risk</button>
        <button className={stage === 4 ? 'active' : ''} onClick={() => setStage(4)}>4. Validate</button>
      </section>

      <section className="algo-layout">
        <div className="algo-main">
          {stage === 1 && <AlgoSection title="Run setup" eyebrow="Mode and metadata">
            <div className="algo-control-grid three">
              <SegmentedControl value={config.runMode} options={['Backtest', 'Create']} onChange={(value) => update('runMode', value as AlgoStrategyConfig['runMode'])} />
              <Field label="Run Name"><input value={config.runName} onChange={(event) => update('runName', event.target.value)} /></Field>
              <Field label="Folder Name"><input value={config.folderName} onChange={(event) => update('folderName', event.target.value)} /></Field>
            </div>
          </AlgoSection>}

          {stage === 1 && <AlgoSection title="Instrument" eyebrow="Instrument selection">
            <div className="algo-control-grid four">
              <Field label="Segment">
                <select value={config.instrumentSegment} onChange={(event) => update('instrumentSegment', event.target.value as AlgoStrategyConfig['instrumentSegment'])}>
                  <option>Equity & Index</option>
                  <option>Future & Options</option>
                </select>
              </Field>
              <Field label="Symbol">
                <select value={config.symbol} onChange={(event) => update('symbol', event.target.value)}>
                  {contracts.slice(0, 80).map((contract) => <option key={contract.symbol}>{contract.symbol}</option>)}
                </select>
              </Field>
              <Field label="Order Type">
                <select value={config.advanced ? 'Limit' : 'Market'} onChange={() => {}}>
                  <option>Market</option>
                  <option>Limit</option>
                </select>
              </Field>
              <Field label="Current Context"><input value={`${selectedContract.name} · ${selectedContract.expiry}`} readOnly /></Field>
              <label className="check-row"><input type="checkbox" checked={config.advanced} onChange={(event) => update('advanced', event.target.checked)} /> Advanced Settings</label>
            </div>
          </AlgoSection>}

          {stage === 2 && <AlgoSection title="Indicators" eyebrow="Signals available to cases">
            <div className="indicator-stack">
              {config.indicators.map((indicator, index) => (
                <div key={indicator.id} className="indicator-config-row">
                  <Field label="Indicator Type">
                    <select value={indicator.type} onChange={(event) => setConfig((current) => ({ ...current, indicators: current.indicators.map((item, i) => i === index ? { ...item, type: event.target.value } : item) }))}>
                      {[indicator.type, ...indicatorTypes.filter((item) => item !== indicator.type)].map((type) => <option key={type}>{type}</option>)}
                    </select>
                  </Field>
                  <Field label="Name"><input value={indicator.name} onChange={(event) => setConfig((current) => ({ ...current, indicators: current.indicators.map((item, i) => i === index ? { ...item, name: event.target.value } : item) }))} /></Field>
                  <Field label="Chart Type">
                    <select value={indicator.chartType} onChange={(event) => setConfig((current) => ({ ...current, indicators: current.indicators.map((item, i) => i === index ? { ...item, chartType: event.target.value } : item) }))}>
                      <option>Candle</option><option>Heikin Ashi</option><option>Open Interest</option><option>Volume</option>
                    </select>
                  </Field>
                  <Field label="Interval">
                    <select value={indicator.interval} onChange={(event) => setConfig((current) => ({ ...current, indicators: current.indicators.map((item, i) => i === index ? { ...item, interval: event.target.value } : item) }))}>
                      <option>1 Minute</option><option>3 Minutes</option><option>5 Minutes</option><option>10 Minutes</option><option>15 Minutes</option><option>30 Minutes</option><option>1 Hour</option><option>1 Day</option>
                    </select>
                  </Field>
                  <Field label="Period"><input type="number" value={indicator.period} onChange={(event) => setConfig((current) => ({ ...current, indicators: current.indicators.map((item, i) => i === index ? { ...item, period: Number(event.target.value) } : item) }))} /></Field>
                </div>
              ))}
              <button className="ghost-action" onClick={() => setConfig((current) => ({ ...current, indicators: [...current.indicators, { id: `indicator-${Date.now()}`, type: 'rsi', name: 'rsi', chartType: 'Candle', interval: '5 Minutes', field: 'Future', period: 14 }] }))}><PlusIcon /> Add Indicator</button>
            </div>
          </AlgoSection>}

          {stage === 2 && <AlgoSection title="Case 1" eyebrow="Entry + exit conditions">
            <div className="feature-row">
              <label className="check-row"><input type="checkbox" checked={config.trailingStopLoss} onChange={(event) => update('trailingStopLoss', event.target.checked)} /> Trailing Stop Loss</label>
              <label className="check-row"><input type="checkbox" checked={config.reEntry} onChange={(event) => update('reEntry', event.target.checked)} /> Re-Entry</label>
              <label className="check-row"><input type="checkbox" checked={config.reExecute} onChange={(event) => update('reExecute', event.target.checked)} /> Re-Execute</label>
              <Field label="Parallel Cases"><select value={config.parallelCases} onChange={(event) => update('parallelCases', event.target.value)}><option>Case 1</option><option>Case 1 + Case 2</option><option>All cases</option></select></Field>
            </div>
            <ConditionEditor title="Entry When" conditions={config.entryConditions} onAdd={() => addCondition('entryConditions')} onUpdate={(index, patch) => updateCondition('entryConditions', index, patch)} />
            <ConditionEditor title="Exit When" conditions={config.exitConditions} onAdd={() => addCondition('exitConditions')} onUpdate={(index, patch) => updateCondition('exitConditions', index, patch)} />
          </AlgoSection>}

          {stage === 3 && <AlgoSection title="Action" eyebrow="Up to 4 option legs">
            <div className="algo-leg-table">
              <div className="algo-leg-head"><span>Segment</span><span>Instrument</span><span>Expiry</span><span>Strike</span><span>Type</span><span>Lot</span><span>Action</span><span>SL</span><span>TP</span></div>
              {config.legs.map((leg, index) => (
                <div key={leg.id} className="algo-leg-row">
                  <select value={leg.segment} onChange={(event) => updateLeg(index, { segment: event.target.value as AlgoLegConfig['segment'] })}><option>Equity & Index</option><option>Future & Options</option></select>
                  <select value={leg.instrumentType} onChange={(event) => updateLeg(index, { instrumentType: event.target.value as AlgoLegConfig['instrumentType'] })}><option>Future</option><option>Option</option></select>
                  <select value={leg.expiry} onChange={(event) => updateLeg(index, { expiry: event.target.value as AlgoLegConfig['expiry'] })}>{expiryChoices.map((item) => <option key={item}>{item}</option>)}</select>
                  <div className="split-field"><select value={leg.selectionBasis} onChange={(event) => updateLeg(index, { selectionBasis: event.target.value })}>{selectionBasisChoices.map((item) => <option key={item}>{item}</option>)}</select><select value={leg.strikeOffset} onChange={(event) => updateLeg(index, { strikeOffset: event.target.value })}>{strikeOffsets.map((item) => <option key={item}>{item}</option>)}</select></div>
                  <SegmentedControl value={leg.optionType} options={['CE', 'PE']} onChange={(value) => updateLeg(index, { optionType: value as AlgoLegConfig['optionType'] })} />
                  <input type="number" value={leg.lots} onChange={(event) => updateLeg(index, { lots: Number(event.target.value) })} />
                  <SegmentedControl value={leg.side} options={['Buy', 'Sell']} onChange={(value) => updateLeg(index, { side: value as AlgoLegConfig['side'] })} />
                  <RiskInput type={leg.stopLossType} value={leg.stopLossValue} onType={(value) => updateLeg(index, { stopLossType: value as AlgoLegConfig['stopLossType'] })} onValue={(value) => updateLeg(index, { stopLossValue: value })} />
                  <RiskInput type={leg.takeProfitType} value={leg.takeProfitValue} onType={(value) => updateLeg(index, { takeProfitType: value as AlgoLegConfig['takeProfitType'] })} onValue={(value) => updateLeg(index, { takeProfitValue: value })} />
                </div>
              ))}
              <button className="ghost-action" disabled={config.legs.length >= 4} onClick={addLeg}><PlusIcon /> Add Leg</button>
            </div>
          </AlgoSection>}

          {stage === 3 && <AlgoSection title="Advanced options" eyebrow="Targets, expiry, and timing">
            <div className="algo-control-grid three">
              <Field label="Adjustment / ReEntry / ReExecute">
                <select value={config.adjustmentTiming} onChange={(event) => update('adjustmentTiming', event.target.value as AlgoStrategyConfig['adjustmentTiming'])}>
                  <option>Next Minute Start</option><option>Immediate</option><option>Delay By</option>
                </select>
              </Field>
              <RiskInput label="Transaction Stop Loss" type={config.transactionStopLossType} value={config.transactionStopLoss} onType={(value) => update('transactionStopLossType', value as AlgoStrategyConfig['transactionStopLossType'])} onValue={(value) => update('transactionStopLoss', value)} />
              <RiskInput label="Transaction Take Profit" type={config.transactionTakeProfitType} value={config.transactionTakeProfit} onType={(value) => update('transactionTakeProfitType', value as AlgoStrategyConfig['transactionTakeProfitType'])} onValue={(value) => update('transactionTakeProfit', value)} />
              <Field label="Daily Stop Loss"><input value={config.dailyStopLoss} onChange={(event) => update('dailyStopLoss', event.target.value)} /></Field>
              <Field label="Daily Take Profit"><input value={config.dailyTakeProfit} onChange={(event) => update('dailyTakeProfit', event.target.value)} /></Field>
              <Field label="Trade Type"><SegmentedControl value={config.tradeType} options={['Intraday', 'Positional']} onChange={(value) => update('tradeType', value as AlgoStrategyConfig['tradeType'])} /></Field>
              <Field label="Trade During"><div className="time-pair"><input type="time" value={config.startTime} onChange={(event) => update('startTime', event.target.value)} /><input type="time" value={config.endTime} onChange={(event) => update('endTime', event.target.value)} /></div></Field>
              <Field label="Max Transactions Per Day"><input type="number" value={config.maxTransactionsPerDay} onChange={(event) => update('maxTransactionsPerDay', Number(event.target.value))} /></Field>
              <Field label="Total Available Margin"><input type="number" value={config.marginLimit} onChange={(event) => update('marginLimit', event.target.value)} /></Field>
              <Field label="Max Loss Limit (per trade)"><input type="number" value={config.maxLossLimit} onChange={(event) => update('maxLossLimit', event.target.value)} /></Field>
              <label className="check-row"><input type="checkbox" checked={config.liquidityFilter} onChange={(event) => update('liquidityFilter', event.target.checked)} /> Enforce A-Grade Liquidity Filter</label>
              <div className="run-credit-box" style={{ gridColumn: '1 / -1' }}><span>Required Credits</span><strong>{Math.max(1, config.legs.length)}</strong><button>Save Strategy</button></div>
            </div>
          </AlgoSection>}

          {stage === 4 && (
            <AlgoSection title="Validate and save" eyebrow="Final checks">
              <div className="validation-summary-grid">
                <InfoBlock title="Run metadata" items={[config.runName, config.folderName, config.runMode]} />
                <InfoBlock title="Signal readiness" items={[`${config.indicators.length} indicators`, `${config.entryConditions.length} entry checks`, `${config.exitConditions.length} exit checks`]} />
                <InfoBlock title="Execution risk" items={[`${config.legs.length} legs`, `Daily SL ${config.dailyStopLoss}`, `Daily TP ${config.dailyTakeProfit}`]} />
              </div>
              <div className="builder-actions">
                <button className="ghost-action" onClick={() => setStage(3)}>Back to risk setup</button>
                <button className="wide-primary">Save Strategy</button>
              </div>
            </AlgoSection>
          )}
        </div>

        <aside className="algo-ai-panel">
          <div className="panel-header"><div><p className="eyebrow">AI Draft</p><h3>{aiDraft.title}</h3></div><span className={`status-pill ${aiDraft.status}`}>{aiDraft.status === 'ready' ? 'Ready' : 'Needs inputs'}</span></div>
          <p className="subcopy">Continue chatting in the floating AI drawer. When the artifact is complete, use this panel to fill the same manual builder.</p>
          <InfoBlock title="Strategy at a glance" items={[`Stage ${stage} of 4`, `${config.symbol} · ${config.tradeType}`, `${config.legs.length} legs · ${config.maxTransactionsPerDay} max trades/day`]} />
          <InfoBlock title="Missing inputs" items={aiDraft.missingInputs.length ? aiDraft.missingInputs : ['No missing inputs. AI can prefill the strategy.']} />
          <InfoBlock title="AI entry rules" items={aiDraft.entryRules.slice(0, 3)} />
          <InfoBlock title="AI exit rules" items={aiDraft.exitRules.slice(0, 3)} />
          <button className="wide-primary" onClick={onApplyAiDraft}><Sparkles size={15} /> Apply AI Draft</button>
        </aside>
      </section>
    </div>
  );
}

function AlgoSection({ title, eyebrow, children }: { title: string; eyebrow: string; children: React.ReactNode }) {
  return <section className="market-panel algo-section"><div className="panel-header"><div><p className="eyebrow">{eyebrow}</p><h3>{title}</h3></div></div>{children}</section>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="field-label"><span>{label}</span>{children}</label>;
}

function SegmentedControl({ value, options, onChange }: { value: string; options: string[]; onChange: (value: string) => void }) {
  return <div className="segmented-control">{options.map((option) => <button key={option} className={value === option ? 'active' : ''} onClick={() => onChange(option)}>{option}</button>)}</div>;
}

function ConditionEditor({ title, conditions, onAdd, onUpdate }: { title: string; conditions: SignalCondition[]; onAdd: () => void; onUpdate: (index: number, patch: Partial<SignalCondition>) => void }) {
  return (
    <div className="condition-card">
      <div className="condition-title"><strong>{title}</strong><button onClick={onAdd}><PlusIcon /> Add Condition</button></div>
      {conditions.map((condition, index) => (
        <div key={condition.id} className="condition-row">
          <select value={condition.left} onChange={(event) => onUpdate(index, { left: event.target.value })}>{signalFields.map((item) => <option key={item}>{item}</option>)}</select>
          <select value={condition.operator} onChange={(event) => onUpdate(index, { operator: event.target.value })}>{signalOperators.map((item) => <option key={item}>{item}</option>)}</select>
          <select value={condition.right} onChange={(event) => onUpdate(index, { right: event.target.value })}>{signalFields.map((item) => <option key={item}>{item}</option>)}</select>
        </div>
      ))}
    </div>
  );
}

function RiskInput({ label, type, value, onType, onValue }: { label?: string; type: string; value: string; onType: (value: string) => void; onValue: (value: string) => void }) {
  const control = <div className="risk-input"><select value={type} onChange={(event) => onType(event.target.value)}><option>%</option><option>₹</option><option>Pts</option><option>Spot %</option><option>Spot Pts</option></select><input value={value} onChange={(event) => onValue(event.target.value)} /></div>;
  return label ? <Field label={label}>{control}</Field> : control;
}

function PlusIcon() {
  return <span aria-hidden="true">+</span>;
}

function Metric({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="metric">
      <i>{icon}</i>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function InfoBlock({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="info-block">
      <h4>{title}</h4>
      {items.map((item) => <span key={item}>{item}</span>)}
    </div>
  );
}

const chartPalette = ['#2d6f8f', '#2f7d58', '#b94f43', '#ad6b1d', '#5f6f52', '#7768ae', '#d46b5b', '#6f8793'];

function ChartPanel({ title, eyebrow, badge, children }: { title: string; eyebrow: string; badge: string; children: React.ReactNode }) {
  return (
    <div className="market-panel">
      <div className="panel-header">
        <div>
          <p className="eyebrow">{eyebrow}</p>
          <h3>{title}</h3>
        </div>
        <span className="badge">{badge}</span>
      </div>
      {children}
    </div>
  );
}

function MiniPayoffPreview({ trade }: { trade: CandidateTrade }) {
  const points = React.useMemo(() => {
    if (!trade.payoff.length) return [0, 0, 0, 0, 0];
    const sliceIndexes = [0, Math.floor(trade.payoff.length * 0.25), Math.floor(trade.payoff.length * 0.5), Math.floor(trade.payoff.length * 0.75), trade.payoff.length - 1];
    const values = sliceIndexes.map((index) => trade.payoff[index]?.pnl ?? 0);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const span = Math.max(1, max - min);
    return values.map((value) => round(((value - min) / span) * 100, 1));
  }, [trade.payoff]);

  return (
    <div className="mini-payoff-preview" aria-hidden="true">
      {points.map((point, index) => (
        <i key={`${trade.id}-${index}`} style={{ height: `${Math.max(14, point)}%` }} />
      ))}
    </div>
  );
}

function MiniOiChart({ chain }: { chain: OptionQuote[] }) {
  const data = combinedOiData(chain).slice(0, 8);
  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={data}>
        <CartesianGrid stroke="#dfe6df" />
        <XAxis dataKey="strike" />
        <YAxis />
        <Tooltip />
        <Bar dataKey="callOi">
          {data.map((_, index) => <Cell key={index} fill="#d46b5b" />)}
        </Bar>
        <Bar dataKey="putOi">
          {data.map((_, index) => <Cell key={index} fill="#3d8a62" />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

function combinedOiData(chain: OptionQuote[]) {
  return uniqueStrikes(chain).map((strike) => {
    const ce = getQuote(chain, strike, 'CE');
    const pe = getQuote(chain, strike, 'PE');
    return {
      strike,
      callOi: ce?.oi ?? 0,
      putOi: pe?.oi ?? 0,
      total: (ce?.oi ?? 0) + (pe?.oi ?? 0)
    };
  });
}

function technicalData(contract: ContractSummary) {
  const open = contract.spot - contract.spot * (contract.changePct / 100);
  const swings = [-0.45, -0.16, 0.08, 0.22, -0.06, 0.31, contract.changePct].map((pct, index) => ({
    time: ['09:15', '10:00', '10:45', '11:30', '12:15', '13:00', '14:09'][index],
    price: round(open * (1 + pct / 100), 2),
    volume: Math.round(140 + index * 35 + Math.abs(pct) * 110),
    signal: round(open * (1 + (pct - 0.12) / 100), 2)
  }));
  swings[swings.length - 1].price = contract.spot;
  return swings;
}

function uniqueStrikes(chain: OptionQuote[]) {
  const strikes = [...new Set(chain.map((quote) => quote.strike))].sort((a, b) => a - b);
  if (strikes.length <= 14) return strikes;
  const instrument = Object.values(instrumentsBySymbol).find((item) => item.symbol && optionChainsBySymbol[item.symbol] === chain);
  const spot = instrument?.spot ?? strikes[Math.floor(strikes.length / 2)];
  const atm = strikes.reduce((closest, strike) => (Math.abs(strike - spot) < Math.abs(closest - spot) ? strike : closest), strikes[0]);
  const atmIndex = strikes.indexOf(atm);
  return strikes.slice(Math.max(0, atmIndex - 7), Math.min(strikes.length, atmIndex + 8));
}

function buildUpRows(chain: OptionQuote[]) {
  const calls = chain.filter((quote) => quote.type === 'CE');
  const puts = chain.filter((quote) => quote.type === 'PE');
  const callOiChange = calls.reduce((sum, quote) => sum + quote.oiChange, 0);
  const putOiChange = puts.reduce((sum, quote) => sum + quote.oiChange, 0);
  const callVolume = calls.reduce((sum, quote) => sum + quote.volume, 0);
  const putVolume = puts.reduce((sum, quote) => sum + quote.volume, 0);
  return [
    ['Long build-up', 'Price up, OI up', `${calls.length + puts.length} active option rows in selected expiry`],
    ['Call activity', 'CE OI and contracts', `OI change ${callOiChange.toLocaleString('en-IN')} · Volume ${callVolume.toLocaleString('en-IN')}`],
    ['Put activity', 'PE OI and contracts', `OI change ${putOiChange.toLocaleString('en-IN')} · Volume ${putVolume.toLocaleString('en-IN')}`],
    ['Dominant side', 'Call vs put change', Math.abs(callOiChange) > Math.abs(putOiChange) ? 'Call-side positioning is stronger' : 'Put-side positioning is stronger']
  ];
}

function median(values: number[]) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return 0;
  const midIndex = Math.floor(sorted.length / 2);
  const value = sorted.length % 2 ? sorted[midIndex] : (sorted[midIndex - 1] + sorted[midIndex]) / 2;
  return round(value, 2);
}

function buildTradeMatrix(source: CandidateTrade[]): Record<DirectionKey, CandidateTrade[]> {
  const byStrategy = (name: string, fallbackIndex: number) => source.find((trade) => trade.strategy === name) ?? source[fallbackIndex % source.length];
  const clone = (base: CandidateTrade, id: string, title: string, profile: RiskProfile, scoreAdjust: number, thesisPrefix: string): CandidateTrade => ({
    ...base,
    id,
    title,
    score: Math.max(50, Math.min(96, round(base.score + scoreAdjust, 1))),
    thesis: `${profile} ${thesisPrefix} ${base.thesis}`,
    riskTags: [profile, ...base.riskTags.slice(0, 2)]
  });

  const bullCall = byStrategy('Bull Call Spread', 0);
  const bullPut = byStrategy('Bull Put Spread', 1);
  const bearPut = byStrategy('Bear Put Spread', 2);
  const ironCondor = byStrategy('Iron Condor', 3);
  const ironFly = byStrategy('Iron Butterfly', 4);
  const straddle = byStrategy('Long Straddle', 0);

  return {
    up: [
      clone(bullPut, 'up-defensive', 'Support Credit: Bull Put Spread', 'Defensive', 3, 'upside view with support confirmation.'),
      clone(bullCall, 'up-neutral', 'Directional Debit: Bull Call Spread', 'Neutral', 1, 'upside participation with capped debit.'),
      clone(bullCall, 'up-aggressive', 'Momentum Call Spread', 'Aggressive', -4, 'higher conviction upside expression.')
    ],
    down: [
      clone(bearPut, 'down-defensive', 'Portfolio Hedge: Bear Put Spread', 'Defensive', 2, 'controlled hedge if support fails.'),
      clone(bearPut, 'down-neutral', 'Directional Debit: Bear Put Spread', 'Neutral', 0, 'downside participation with capped debit.'),
      clone(bearPut, 'down-aggressive', 'Breakdown Put Spread', 'Aggressive', -5, 'higher conviction downside expression.')
    ],
    rangebound: [
      clone(ironCondor, 'range-defensive', 'Wide Range Iron Condor', 'Defensive', 4, 'wide wings around OI walls.'),
      clone(ironCondor, 'range-neutral', 'Range Credit: Iron Condor', 'Neutral', 1, 'balanced theta-positive range setup.'),
      clone(ironFly, 'range-aggressive', 'Pin Risk: Iron Butterfly', 'Aggressive', -5, 'tighter max-pain setup with higher pin sensitivity.')
    ],
    volatile: [
      clone(straddle, 'vol-defensive', 'Defined Debit: Long Straddle', 'Defensive', 2, 'event-move exposure with debit-only risk.'),
      clone(straddle, 'vol-neutral', 'ATM Volatility Breakout', 'Neutral', 0, 'two-sided move expectation around ATM.'),
      clone(straddle, 'vol-aggressive', 'High Convexity Long Straddle', 'Aggressive', -4, 'maximum convexity if expected move expands.')
    ]
  };
}

function optionQuoteRow(instrument: Instrument, quote: OptionQuote) {
  const price = mid(quote);
  const prevOi = Math.max(1, quote.oi - quote.oiChange);
  const dayChangePct = round(((quote.ltp - price * 0.96) / Math.max(1, price * 0.96)) * 100, 2);
  const spread = quote.ask > 0 && quote.bid > 0 ? round(((quote.ask - quote.bid) / Math.max(0.01, price)) * 100, 2) : 0;
  const fairEdge = round((quote.delta * 2 + quote.oiChange / Math.max(1, quote.oi) * 10), 2);
  return {
    price,
    open: round(price * 0.96, 2),
    high: round(price * 1.08, 2),
    low: round(price * 0.9, 2),
    dayChangePct,
    oiChangePct: round((quote.oiChange / prevOi) * 100, 2),
    volumeChangePct: round(Math.min(300, quote.volume / 1000), 1),
    basis: round((instrument.spot * 1.0008 - instrument.spot), 2),
    coc: 6.4,
    prevIv: round(quote.iv * 100 * 0.94, 1),
    ivChangePct: round(((quote.iv * 100 - quote.iv * 100 * 0.94) / Math.max(1, quote.iv * 100 * 0.94)) * 100, 2),
    buildUp: buildUpLabel(quote),
    spreadPct: spread,
    fairEdge,
    pop: quote.type === 'CE' ? round(Math.max(5, Math.min(95, quote.delta * 100)), 1) : round(Math.max(5, Math.min(95, Math.abs(quote.delta) * 100)), 1)
  };
}

function buildUpLabel(quote: OptionQuote) {
  if (quote.oiChange > 0 && quote.ltp >= mid(quote)) return 'Long Build Up';
  if (quote.oiChange > 0 && quote.ltp < mid(quote)) return 'Short Build Up';
  if (quote.oiChange < 0 && quote.ltp >= mid(quote)) return 'Short Covering';
  return 'Long Unwinding';
}

function optionChainEntries(contracts: ContractSummary[] = contractRows, liveCache: LiveMarketCache = {}) {
  const contractBySymbol = new Map(contracts.map((contract) => [contract.symbol, contract]));
  const entries = new Map<string, { contract: ContractSummary; instrument: Instrument; chain: OptionQuote[] }>();

  Object.entries(optionChainsBySymbol).forEach(([symbol, chain]) => {
    const contract = contractBySymbol.get(symbol) ?? contractRows.find((item) => item.symbol === symbol);
    const instrument = instrumentsBySymbol[symbol] ?? instrumentsBySymbol[defaultContract.symbol];
    if (contract && instrument) entries.set(symbol, { contract, instrument, chain });
  });

  Object.entries(liveCache).forEach(([symbol, live]) => {
    const base = contractBySymbol.get(symbol) ?? contractRows.find((item) => item.symbol === symbol);
    const contract = base ? liveContractSummary(base, live) : undefined;
    if (contract) entries.set(symbol, { contract, instrument: live.instrument, chain: live.chain });
  });

  return [...entries.entries()];
}

function buildActivityRows(
  type: 'CE' | 'PE',
  sortBy: 'volume' | 'price' | 'oi',
  contracts: ContractSummary[] = contractRows,
  liveCache: LiveMarketCache = {}
) {
  const rows = optionChainEntries(contracts, liveCache).flatMap(([symbol, { chain, contract, instrument }]) => {
    if (!contract) return [];
    return chain
      .filter((quote) => quote.type === type)
      .map((quote) => {
        const derived = optionQuoteRow(instrument, quote);
        return {
          contract,
          symbol,
          name: contract.name,
          type,
          strike: quote.strike,
          price: derived.price,
          volume: quote.volume,
          oi: quote.oi,
          oiChangePct: derived.oiChangePct,
          priceChangePct: derived.dayChangePct
        };
      });
  });
  const score = (row: typeof rows[number]) => sortBy === 'volume' ? row.volume : sortBy === 'oi' ? row.oiChangePct : row.priceChangePct;
  return rows.sort((a, b) => score(b) - score(a)).slice(0, 8);
}

function buildDashboardCharts(contracts: ContractSummary[]) {
  const indexSymbols = new Set(['NIFTY', 'BANKNIFTY', 'FINNIFTY', 'MIDCPNIFTY', 'NIFTYNEXT50']);
  const byBuildUp = contracts.reduce<Record<string, number>>((acc, contract) => {
    acc[contract.buildUp] = (acc[contract.buildUp] ?? 0) + 1;
    return acc;
  }, {});
  return {
    indexCards: contracts.filter((contract) => indexSymbols.has(contract.symbol)).slice(0, 5),
    pcrLeaders: [...contracts]
      .sort((a, b) => b.pcr - a.pcr)
      .slice(0, 10)
      .map((contract) => ({ symbol: contract.symbol, name: contract.name, pcrOi: contract.pcr, pcrVolume: contract.volumePcr })),
    mwplLeaders: [...contracts]
      .filter((contract) => contract.mwpl > 0)
      .sort((a, b) => b.mwpl - a.mwpl)
      .slice(0, 10)
      .map((contract) => ({ symbol: contract.symbol, name: contract.name, mwpl: contract.mwpl, oiChangePct: contract.oiChangePct })),
    oiChangeLeaders: [...contracts]
      .sort((a, b) => Math.abs(b.oiChangePct) - Math.abs(a.oiChangePct))
      .slice(0, 10)
      .map((contract) => ({
        symbol: contract.symbol,
        name: contract.name,
        oiChangePct: contract.oiChangePct,
        putOiChangePct: contract.putOiChangePct,
        callOiChangePct: contract.callOiChangePct
      })),
    buildupMix: Object.entries(byBuildUp).map(([bucket, count]) => ({ bucket, contracts: count }))
  };
}

function buildDashboardInsights(nifty: ContractSummary, bankNifty: ContractSummary, oiLeader?: string) {
  return [
    `${nifty.symbol} is ${nifty.trend.toLowerCase()} with PCR ${nifty.pcr}; use Quick Trades to compare range and volatility structures.`,
    `${bankNifty.symbol} shows ${bankNifty.buildUp.toLowerCase()} and ${bankNifty.oiChangePct}% OI change; confirm with Combined OI before short premium.`,
    `${oiLeader ?? 'FINNIFTY'} leads OI change, so screeners should include build-up and liquidity filters.`,
    `Live symbols refresh through the VPS; unfetched symbols keep the ${dataSource.workbook} fallback until selected.`
  ];
}

function demoEvents() {
  return [
    { date: 'Today', title: 'Weekly options expiry', impact: 'High', warning: 'gamma risk' },
    { date: 'Tomorrow', title: 'Banking sector results window', impact: 'Medium', warning: 'event IV' },
    { date: 'Fri', title: 'Macro data watch', impact: 'Medium', warning: 'gap risk' },
    { date: 'Next week', title: 'Monthly expiry positioning', impact: 'High', warning: 'rollover risk' }
  ];
}

function buildScreenerResults(
  filters: Record<string, string>,
  contracts: ContractSummary[] = contractRows,
  liveCache: LiveMarketCache = {}
) {
  const wantsCalls = filters.instrument === 'Calls';
  const wantsPuts = filters.instrument === 'Puts';
  const minLiquidity = filters.liquidity === 'A only' ? 86 : 72;
  const rows = optionChainEntries(contracts, liveCache).flatMap(([symbol, { chain, contract, instrument }]) => {
    if (!contract || contract.liquidity < minLiquidity) return [];
    if (filters.universe === 'Index Options' && !['NIFTY', 'BANKNIFTY', 'FINNIFTY', 'MIDCPNIFTY'].includes(symbol)) return [];
    if (filters.universe === 'Banking' && contract.industry !== 'Banks' && symbol !== 'BANKNIFTY') return [];
    return chain
      .filter((quote) => (wantsCalls ? quote.type === 'CE' : wantsPuts ? quote.type === 'PE' : true))
      .map((quote) => {
        const row = optionQuoteRow(instrument, quote);
        return {
          contract,
          symbol,
          name: contract.name,
          type: quote.type,
          strike: quote.strike,
          price: row.price,
          oi: quote.oi,
          oiChange: quote.oiChange,
          oiChangePct: row.oiChangePct,
          volume: quote.volume,
          iv: round(quote.iv * 100, 1),
          delta: round(quote.delta, 2),
          liquidity: contract.liquidity >= 86 ? 'A' : 'B'
        };
      });
  });
  return rows
    .filter((row) => filters.iv === 'Any IV' || (filters.iv.includes('below') ? row.iv < 60 : filters.iv.includes('above') ? row.iv > 60 : true))
    .sort((a, b) => b.volume + b.oiChangePct * 100 - (a.volume + a.oiChangePct * 100))
    .slice(0, 18);
}

function labelize(value: string) {
  return value.replace(/[A-Z]/g, (letter) => ` ${letter.toLowerCase()}`).replace(/^./, (letter) => letter.toUpperCase());
}

export default FnOCopilotApp;
