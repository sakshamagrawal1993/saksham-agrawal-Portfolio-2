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
import { contractRows, dataSource, DemoContractSummary, instrumentsBySymbol, marketCharts, optionChainsBySymbol } from './data/excelMarket';
import {
  fetchFnOCopilotBootstrap,
  fetchFnOCopilotChatReply,
  isFnOCopilotEdgeEnabled
} from './fnoCopilotApi';
import { assistantReply, buildWorkflowSteps, createInitialMessages, draftFromChat } from './lib/aiPlanner';
import { aggregateGreeks, computeChainAnalytics, getAtmStrike, getQuote, mid, round, rupee } from './lib/calculations';
import { generateTopTrades } from './lib/strategyEngine';
import { CandidateTrade, ChainAnalytics, ChatMessage, Instrument, OptionChainColumnGroup, OptionQuote, UserMode } from './types';
import './styles.css';

type Screen = 'dashboard' | 'contract' | 'analyse-trade' | 'create-trades' | 'algo-builder' | 'screener' | 'paper-trades';
type WorkspaceMode = 'standard' | 'agent';
type DataBackendStatus = 'local' | 'edge-online' | 'edge-error';
type DetailTab = 'overview' | 'option-chain' | 'combined-oi' | 'technicals' | 'build-up' | 'quick-trades';
type DirectionKey = 'up' | 'down' | 'rangebound' | 'volatile';
type RiskProfile = 'Defensive' | 'Neutral' | 'Aggressive';
type ContractSummary = DemoContractSummary;
type AgentArtifactMode = Exclude<UserMode, 'ask-ai'>;

type AgentHistoryItem = {
  id: string;
  mode: UserMode;
  title: string;
  preview: string;
  createdAt: string;
};

type AgentArtifactItem = {
  id: string;
  mode: AgentArtifactMode;
  title: string;
  description: string;
  meta: string;
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
const indicatorTypes = ['simpleMovingAverage', 'exponentialMovingAverage', 'rsi', 'superTrend', 'bollingerBands', 'macd', 'vwap', 'adx', 'openInterest', 'ivRank', 'ivPercentile', 'expectedMove', 'oiWall', 'pcr', 'fairValueDeviation'];
const signalFields = ['Current Close', 'Current Open', 'Current High', 'Current Low', 'Current Open Interest', 'Current Volume', 'Bid Ask Spread %', 'IV Rank', 'Expected Move', 'OI Wall', 'Time Of Day', 'Day Of Week', 'Date', 'Days To Expire', 'Future Last Traded Price', 'Equity Last Traded Price', 'sma', 'rsi', 'vwap', 'adx'];
const signalOperators = ['Equal To', 'Is Above', 'Is Below', 'Crosses Above', 'Crosses Below', 'Equal Or Above', 'Equal Or Below'];
const strikeOffsets = ['ITM 5', 'ITM 4', 'ITM 3', 'ITM 2', 'ITM 1', 'ATM', 'OTM 1', 'OTM 2', 'OTM 3', 'OTM 4', 'OTM 5'];
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

const starterArtifactHistory: AgentArtifactItem[] = [
  {
    id: 'artifact-range',
    mode: 'create-trade',
    title: 'NIFTY Range Credit Trade',
    description: 'Defined-risk range trade drafted from OI walls and IV state.',
    meta: 'Trade · POP 62%',
    createdAt: 'Earlier'
  },
  {
    id: 'artifact-algo',
    mode: 'create-strategy',
    title: 'Range and Liquidity Algo',
    description: 'Reusable rules with liquidity filters, entry conditions, and exits.',
    meta: 'Algo · 4 checks',
    createdAt: 'Earlier'
  },
  {
    id: 'artifact-screener',
    mode: 'screener',
    title: 'High IV Liquid Screener',
    description: 'Saved scan for IV rank, OI change, spread, and moneyness.',
    meta: 'Screen · 18 rows',
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
    transactionStopLossType: '%',
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

function createMarketContext(contract: ContractSummary) {
  const instrument = instrumentsBySymbol[contract.symbol] ?? instrumentsBySymbol[defaultContract.symbol];
  const chain = optionChainsBySymbol[contract.symbol] ?? optionChainsBySymbol[defaultContract.symbol] ?? [];
  const analytics = computeChainAnalytics(instrument, chain);
  const overview = {
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
  const [artifactHistory, setArtifactHistory] = React.useState<AgentArtifactItem[]>(starterArtifactHistory);
  const [input, setInput] = React.useState('');
  const [algoConfig, setAlgoConfig] = React.useState<AlgoStrategyConfig>(() => createDefaultAlgoConfig(defaultContract));
  const [, setDataBackendStatus] = React.useState<DataBackendStatus>(
    isFnOCopilotEdgeEnabled() ? 'edge-online' : 'local'
  );

  const activeContract = selectedContract ?? defaultContract;
  const marketContext = React.useMemo(() => createMarketContext(activeContract), [activeContract]);
  const { analytics, baseTrades, chain, instrument, overview, tradeMatrix } = marketContext;
  const activeTrades = tradeMatrix[direction];
  const selectedTrade = activeTrades.find((trade) => trade.id === selectedTradeId) ?? activeTrades[1] ?? activeTrades[0] ?? baseTrades[0];
  const allTrades = React.useMemo(() => Object.values(tradeMatrix).flat(), [tradeMatrix]);
  const draft = React.useMemo(() => draftFromChat(mode, messages, allTrades, overview), [mode, messages, allTrades, overview]);
  const workflowSteps = buildWorkflowSteps(mode, draft.status === 'ready');

  React.useEffect(() => {
    if (!activeTrades.some((trade) => trade.id === selectedTradeId)) {
      setSelectedTradeId(activeTrades[1]?.id ?? activeTrades[0]?.id ?? '');
    }
  }, [activeTrades, selectedTradeId]);

  React.useEffect(() => {
    if (!isFnOCopilotEdgeEnabled()) {
      setDataBackendStatus('local');
      return;
    }

    let cancelled = false;
    setDataBackendStatus('edge-online');

    fetchFnOCopilotBootstrap()
      .then(() => {
        if (!cancelled) setDataBackendStatus('edge-online');
      })
      .catch(() => {
        if (!cancelled) setDataBackendStatus('edge-error');
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const openContract = (contract: ContractSummary, nextTab: DetailTab = 'overview') => {
    setSelectedContract(contract);
    setScreen('contract');
    setTab(nextTab);
    if (!selectedTradeId && activeTrades[1]) setSelectedTradeId(activeTrades[1].id);
  };

  const goFindTrades = () => {
    if (!selectedContract) {
      openContract(contractRows[0], 'quick-trades');
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

  const sendMessage = async () => {
    const text = input.trim();
    if (!text) return;
    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      text,
      createdAt: new Date().toISOString()
    };
    const nextDraft = draftFromChat(mode, [...messages, userMessage], allTrades, overview);
    let assistantText = assistantReply(nextDraft);

    if (isFnOCopilotEdgeEnabled()) {
      try {
        const edgeReply = await fetchFnOCopilotChatReply({
          mode,
          message: text,
          instrument: activeContract.symbol,
          expiry: activeContract.expiry
        });
        if (edgeReply.assistant_message) {
          assistantText = edgeReply.assistant_message;
        }
        setDataBackendStatus('edge-online');
      } catch {
        setDataBackendStatus('edge-error');
      }
    }

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
    if (mode !== 'ask-ai') {
      const artifactMode = mode as AgentArtifactMode;
      setArtifactHistory((current) => [
        {
          id: `artifact-${Date.now()}`,
          mode: artifactMode,
          title: nextDraft.title,
          description:
            nextDraft.status === 'ready'
              ? 'Ready artifact generated from chat inputs.'
              : `Needs ${nextDraft.missingInputs.slice(0, 2).join(', ') || 'more detail'}.`,
          meta:
            artifactMode === 'create-trade' && nextDraft.selectedTrade
              ? `${nextDraft.selectedTrade.strategy} · Score ${nextDraft.selectedTrade.score}`
              : artifactMode === 'create-strategy'
                ? `Algo · ${nextDraft.entryRules.length + nextDraft.exitRules.length} rules`
                : `Screen · ${nextDraft.filters.length} filters`,
          createdAt: timeLabel
        },
        ...current
      ].slice(0, 8));
    }
    setSubmittedModes((current) => ({ ...current, [mode]: true }));
    setMessages((current) => [...current, userMessage, assistantMessage]);
    setInput('');
  };

  return (
    <div className="fno-copilot-app">
      <div className="app-shell">
        {workspaceMode === 'standard' && (
          <ProductNav
            workspaceMode={workspaceMode}
            setWorkspaceMode={setWorkspaceMode}
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
          {workspaceMode === 'agent' ? (
            <AgentModeWorkspace
              mode={mode}
              setMode={setMode}
              activeContract={activeContract}
              overview={overview}
              draft={draft}
              messages={messages}
              chatHistory={chatHistory}
              artifactHistory={artifactHistory}
              input={input}
              setInput={setInput}
              sendMessage={sendMessage}
              workflowSteps={workflowSteps}
              showArtifact={mode !== 'ask-ai' && Boolean(submittedModes[mode])}
              onNewChat={() => {
                setMessages(createInitialMessages());
                setSubmittedModes({});
                setInput('');
              }}
              onOpenData={() => {
                setWorkspaceMode('standard');
                setScreen(selectedContract ? 'contract' : 'dashboard');
              }}
              onOpenTrade={(tradeId) => openAnalyseTrade(tradeId)}
              onOpenAlgo={applyAiAlgoDraft}
              onOpenScreener={openScreener}
            />
          ) : screen === 'algo-builder' ? (
            <CreateAlgoWorkspace
              config={algoConfig}
              setConfig={setAlgoConfig}
              aiDraft={draft}
              selectedContract={activeContract}
              onApplyAiDraft={applyAiAlgoDraft}
            />
          ) : screen === 'create-trades' ? (
            <CreateTradesWorkspace
              activeContract={activeContract}
              topTrades={baseTrades.slice(0, 5)}
              tradeMatrix={tradeMatrix}
              onOpenContract={openContract}
              onAnalyseTrade={openAnalyseTrade}
            />
          ) : screen === 'screener' ? (
            <OptionScreener onOpenContract={openContract} onAnalyseTrade={openAnalyseTrade} />
          ) : screen === 'analyse-trade' ? (
            <TradeAnalysisPage trade={selectedTrade} instrument={instrument} contract={activeContract} onBack={() => setScreen(selectedContract ? 'contract' : 'dashboard')} />
          ) : screen === 'dashboard' || !selectedContract ? (
            <OptionsDashboard onSelectContract={openContract} />
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
      </div>
    </div>
  );
}

function ProductNav({
  workspaceMode,
  setWorkspaceMode,
  onDashboard
}: {
  workspaceMode: WorkspaceMode;
  setWorkspaceMode: (mode: WorkspaceMode) => void;
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
      <div className="workspace-switch" aria-label="Workspace mode">
        <button className={workspaceMode === 'standard' ? 'active' : ''} onClick={() => setWorkspaceMode('standard')}>Standard</button>
        <button className={workspaceMode === 'agent' ? 'active' : ''} onClick={() => setWorkspaceMode('agent')}><Bot size={14} /> Agent</button>
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
  activeContract,
  overview,
  draft,
  messages,
  chatHistory,
  artifactHistory,
  input,
  setInput,
  sendMessage,
  workflowSteps,
  showArtifact,
  onNewChat,
  onOpenData,
  onOpenTrade,
  onOpenAlgo,
  onOpenScreener
}: {
  mode: UserMode;
  setMode: (mode: UserMode) => void;
  activeContract: ContractSummary;
  overview: ReturnType<typeof createMarketContext>['overview'];
  draft: ReturnType<typeof draftFromChat>;
  messages: ChatMessage[];
  chatHistory: AgentHistoryItem[];
  artifactHistory: AgentArtifactItem[];
  input: string;
  setInput: (value: string) => void;
  sendMessage: () => void;
  workflowSteps: ReturnType<typeof buildWorkflowSteps>;
  showArtifact: boolean;
  onNewChat: () => void;
  onOpenData: () => void;
  onOpenTrade: (tradeId?: string) => void;
  onOpenAlgo: () => void;
  onOpenScreener: () => void;
}) {
  const selectedTrade = draft.selectedTrade;
  const visibleMessages = messages.filter((message) => message.id !== 'welcome' || messages.some((item) => item.role === 'user'));
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
        <nav className="agent-sidebar-nav" aria-label="Agent shortcuts">
          <button className={mode === 'ask-ai' ? 'active' : ''} onClick={() => setMode('ask-ai')}><Bot size={15} /> Ask AI</button>
          <button className={mode === 'create-trade' ? 'active' : ''} onClick={() => setMode('create-trade')}><Target size={15} /> Create Trades</button>
          <button className={mode === 'create-strategy' ? 'active' : ''} onClick={() => setMode('create-strategy')}><BrainCircuit size={15} /> Create Algo</button>
          <button className={mode === 'screener' ? 'active' : ''} onClick={() => setMode('screener')}><ListFilter size={15} /> Option Screener</button>
        </nav>
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
        <div className="agent-sidebar-section">
          <p><Layers3 size={13} /> Artifacts</p>
          <div className="agent-history-list">
            {artifactHistory.map((item) => (
              <button key={item.id} onClick={() => setMode(item.mode)}>
                <strong>{item.title}</strong>
                <span>{item.meta} · {item.createdAt}</span>
              </button>
            ))}
          </div>
        </div>
        <div className="agent-market-card">
          <p>Market context</p>
          <strong>{activeContract.symbol}</strong>
          <span>{overview.regime} · IV {overview.chain.atmIv}%</span>
          <div className="agent-context-bars">
            <MiniBar label="PCR" value={overview.chain.pcrOi} max={2} />
            <MiniBar label="IV" value={overview.chain.atmIv} max={120} />
            <MiniBar label="Liq" value={overview.chain.liquidityScore} max={100} />
          </div>
        </div>
        <div className="agent-sidebar-footer">FnO Co-Pilot · Educational demo</div>
      </aside>

      <section className={`agent-stage ${showArtifact ? 'with-artifact' : ''}`}>
        <div className="agent-center">
          {visibleMessages.length > 0 ? (
            <div className="agent-thread">
              {visibleMessages.slice(-6).map((message) => (
                <div key={message.id} className={`agent-thread-message ${message.role}`}>
                  <span>{message.role === 'assistant' ? 'FnO Agent' : 'You'}</span>
                  <p>{message.text}</p>
                </div>
              ))}
            </div>
          ) : (
            <div className="agent-welcome">
              <Sparkles size={36} />
              <h2>What should we work on?</h2>
              <p>{mode === 'ask-ai' ? 'Ask anything about the option chain, Greeks, IV, OI, or payoff behaviour.' : 'Describe the trade, algo, or screener you want. I will ask for missing inputs before creating an artifact.'}</p>
            </div>
          )}

          <div className="agent-context-strip" aria-label="Current market context">
            <span><b>Mode</b><strong>{agentModeLabels[mode]}</strong></span>
            <span><b>Underlying</b><strong>{activeContract.symbol}</strong></span>
            <span><b>Regime</b><strong>{overview.regime}</strong></span>
            <span><b>PCR</b><strong>{overview.chain.pcrOi}</strong></span>
          </div>

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
              <span>{activeContract.symbol}</span>
              <button onClick={sendMessage}><Send size={16} /></button>
            </div>
          </div>

          <div className="agent-quick-pills">
            {modeButtons.map((item) => (
              <button key={item.id} className={mode === item.id ? 'active' : ''} onClick={() => setMode(item.id)}>
                {item.icon}{item.label}
              </button>
            ))}
          </div>
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
                <InfoBlock title="Filters" items={draft.filters} />
                <InfoBlock title="Entry" items={draft.entryRules} />
                <InfoBlock title="Exit and risk" items={[...draft.exitRules.slice(0, 2), ...draft.riskRules.slice(0, 2)]} />
                <button className="wide-primary" onClick={onOpenAlgo}><BrainCircuit size={15} /> Open Prefilled Algo Builder</button>
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

function MiniBar({ label, value, max }: { label: string; value: number; max: number }) {
  const width = Math.max(4, Math.min(100, (value / max) * 100));
  return (
    <span>
      <b>{label}</b>
      <i><em style={{ width: `${width}%` }} /></i>
      <strong>{round(value, 1)}</strong>
    </span>
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

function OptionsDashboard({ onSelectContract }: { onSelectContract: (contract: ContractSummary) => void }) {
  const [query, setQuery] = React.useState('');
  const [trendFilter, setTrendFilter] = React.useState<'All' | ContractSummary['trend']>('All');
  const [contractView, setContractView] = React.useState<'top' | 'all'>('top');
  const filteredContracts = React.useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return contractRows
      .filter((contract) => trendFilter === 'All' || contract.trend === trendFilter)
      .filter((contract) => {
        if (!normalized) return true;
        return [contract.symbol, contract.name, contract.industry].some((value) => value.toLowerCase().includes(normalized));
      });
  }, [query, trendFilter]);
  const medianPcr = median(contractRows.map((contract) => contract.pcr));
  const highMwpl = contractRows.filter((contract) => contract.mwpl >= 80).length;
  const latestUpdated = defaultContract ? instrumentsBySymbol[defaultContract.symbol]?.snapshotTs : dataSource.generatedAt;
  const nifty = contractRows.find((contract) => contract.symbol === 'NIFTY') ?? contractRows[0];
  const bankNifty = contractRows.find((contract) => contract.symbol === 'BANKNIFTY') ?? contractRows[1] ?? contractRows[0];
  const activity = React.useMemo(() => ({
    callsActive: buildActivityRows('CE', 'volume'),
    callsGainers: buildActivityRows('CE', 'price'),
    callsOi: buildActivityRows('CE', 'oi'),
    putsActive: buildActivityRows('PE', 'volume'),
    putsGainers: buildActivityRows('PE', 'price'),
    putsOi: buildActivityRows('PE', 'oi')
  }), []);
  const insights = buildDashboardInsights(nifty, bankNifty);
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

  return (
    <div className="page-stack">
      <header className="page-header">
        <div>
          <p className="eyebrow">Markets · Options dashboard</p>
          <h2>NSE F&O contracts</h2>
          <p className="subcopy">Excel-backed FnO universe with contract selection, PCR, open interest, build-up, volatility, MWPL, and trade discovery entry points.</p>
        </div>
        <div className="search-box">
          <Search size={17} />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search any FnO stock or index..." />
        </div>
      </header>

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
          <small>Demo delayed flow · not a hard trade trigger</small>
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

      <section className="dashboard-metrics">
        <Metric icon={<Activity size={18} />} label="FnO stocks" value={contractRows.length.toString()} />
        <Metric icon={<Gauge size={18} />} label="Median PCR OI" value={medianPcr.toString()} />
        <Metric icon={<ListFilter size={18} />} label="MWPL above 80%" value={highMwpl.toString()} />
        <Metric icon={<ShieldCheck size={18} />} label="Mode" value="Demo · Excel" />
      </section>

      <section className="dashboard-grid">
        <div className="market-panel large">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Most active option contracts</p>
              <h3>Pick a FnO stock or index to analyse</h3>
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
            {marketCharts.indexCards.map((contract) => (
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
            <ComposedChart data={marketCharts.pcrLeaders}>
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
              <Pie data={marketCharts.buildupMix} dataKey="contracts" nameKey="bucket" cx="50%" cy="50%" outerRadius={86} label>
                {marketCharts.buildupMix.map((_, index) => <Cell key={index} fill={chartPalette[index % chartPalette.length]} />)}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </ChartPanel>

        <ChartPanel title="MWPL risk watch" eyebrow="Position limits" badge="Top 10">
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={marketCharts.mwplLeaders} layout="vertical" margin={{ left: 16, right: 16 }}>
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
            <BarChart data={marketCharts.oiChangeLeaders}>
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
            <span>FnO stock universe from workbook: {contractRows.length} symbols</span>
            <span>OI, PCR, MWPL, rollover and volatility from F&O Stocks</span>
            <span>Option chain, IV, Greeks and build-up from F&O Data</span>
            <span>Bid/ask spread is synthetic until Upstox quote fields are connected</span>
            <span>Last sample update {latestUpdated?.slice(0, 16).replace('T', ' ')}</span>
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
  topTrades,
  tradeMatrix,
  onOpenContract,
  onAnalyseTrade
}: {
  activeContract: ContractSummary;
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
          <select value={activeContract.symbol} onChange={(event) => onOpenContract(contractRows.find((contract) => contract.symbol === event.target.value) ?? activeContract, 'overview')}>
            {contractRows.slice(0, 120).map((contract) => <option key={contract.id}>{contract.symbol}</option>)}
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

function OptionScreener({ onOpenContract, onAnalyseTrade }: { onOpenContract: (contract: ContractSummary, nextTab?: DetailTab) => void; onAnalyseTrade: (tradeId?: string) => void }) {
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
  const results = React.useMemo(() => buildScreenerResults(filters), [filters]);
  const querySummary = Object.entries(filters).filter(([, value]) => value && !String(value).startsWith('Any')).map(([key, value]) => `${labelize(key)} = ${value}`).join(' · ');
  const activeFilters = Object.entries(filters).filter(([key, value]) => value !== defaults[key as keyof typeof defaults]);

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

      <section className="screener-panel">
        <div className="screener-toolbar">
          <SegmentedControl value="Options" options={['Options', 'Futures']} onChange={() => undefined} />
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
          <span className="badge">Demo deterministic</span>
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
          <span>{contract.name} · {contract.expiry} · educational demo analysis</span>
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
  const rows = strikes.flatMap((strike) => [getQuote(chain, strike, 'CE'), getQuote(chain, strike, 'PE')].filter((quote): quote is OptionQuote => !!quote));
  const toggleGroup = (group: OptionChainColumnGroup) => {
    setGroups((current) => current.includes(group) ? current.filter((item) => item !== group) : [...current, group]);
  };
  const setPreset = (preset: 'scalping' | 'positional' | 'volatility') => {
    if (preset === 'scalping') setGroups(['Price', 'OI/Volume']);
    if (preset === 'positional') setGroups(['Price', 'OI/Volume', 'Greeks', 'Model Edge']);
    if (preset === 'volatility') setGroups(['Price', 'Volatility', 'Greeks']);
  };
  return (
    <section className="market-panel">
      <div className="panel-header">
        <div>
          <p className="eyebrow">Option Chain</p>
          <h3>Grouped chain table with decision fields</h3>
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
      <div className="option-chain-table">
        {focusStrike ? <div className="chain-focus-chip">Focused strike {focusStrike}</div> : null}
        <div className="option-chain-head">
          <span className="sticky-col symbol">Symbol</span><span className="sticky-col type">Type</span><span className="sticky-col strike">Strike</span>
          {groups.includes('Price') && <><span>Price</span><span>Spot</span><span>Day %</span><span>Open</span><span>High</span><span>Low</span></>}
          {groups.includes('OI/Volume') && <><span>OI</span><span>OI %</span><span>OI Chg</span><span>Contracts</span><span>Vol %</span></>}
          {groups.includes('Futures') && <><span>Basis</span><span>CoC</span></>}
          {groups.includes('Volatility') && <><span>IV</span><span>Prev IV</span><span>IV %</span></>}
          {groups.includes('Greeks') && <><span>Delta</span><span>Vega</span><span>Gamma</span><span>Theta</span><span>Rho</span></>}
          {groups.includes('Model Edge') && <><span>Build Up</span><span>Spread</span><span>Fair Edge</span><span>POP</span></>}
        </div>
        {rows.map((quote) => {
          const derived = optionQuoteRow(instrument, quote);
          return (
            <div key={`${quote.strike}-${quote.type}`} className={`option-chain-row ${quote.strike === atm ? 'atm' : ''} ${focusStrike === quote.strike ? 'focus' : ''}`}>
              <strong className="sticky-col symbol">{instrument.symbol}</strong><span className="sticky-col type">{quote.type}</span><span className="sticky-col strike">{quote.strike}</span>
              {groups.includes('Price') && (
                <>
                  <span>₹{derived.price}</span>
                  <span>₹{round(instrument.spot, 1)}</span>
                  <span className={derived.dayChangePct >= 0 ? 'positive' : 'negative'}>{derived.dayChangePct}%</span>
                  <span>₹{derived.open}</span>
                  <span>₹{derived.high}</span>
                  <span>₹{derived.low}</span>
                </>
              )}
              {groups.includes('OI/Volume') && (
                <>
                  <span className="oi-cell">
                    {quote.oi.toLocaleString('en-IN')}
                    <i><em style={{ width: `${Math.min(100, Math.max(6, quote.oi / 9000))}%` }} /></i>
                  </span>
                  <span className={derived.oiChangePct >= 0 ? 'positive' : 'negative'}>{derived.oiChangePct}%</span>
                  <span>{quote.oiChange.toLocaleString('en-IN')}</span>
                  <span>{quote.volume.toLocaleString('en-IN')}</span>
                  <span>{derived.volumeChangePct}%</span>
                </>
              )}
              {groups.includes('Futures') && <><span>{derived.basis}</span><span>{derived.coc}%</span></>}
              {groups.includes('Volatility') && <><span>{round(quote.iv * 100, 1)}%</span><span>{derived.prevIv}%</span><span className={derived.ivChangePct >= 0 ? 'positive' : 'negative'}>{derived.ivChangePct}%</span></>}
              {groups.includes('Greeks') && <><span>{round(quote.delta, 3)}</span><span>{round(quote.vega, 3)}</span><span>{round(quote.gamma, 3)}</span><span>{round(quote.theta, 3)}</span><span>{round(quote.rho, 3)}</span></>}
              {groups.includes('Model Edge') && (
                <>
                  <span>{derived.buildUp}</span>
                  <span className={`spread-badge ${derived.spreadPct > 3 ? 'risk' : 'safe'}`}>{derived.spreadPct}%</span>
                  <span className={derived.fairEdge >= 0 ? 'positive' : 'negative'}>{derived.fairEdge}%</span>
                  <span>{derived.pop}%</span>
                </>
              )}
            </div>
          );
        })}
        {rows.length === 0 ? <div className="empty-state"><strong>No option chain rows.</strong><span>Change selected expiry or refresh quote source.</span></div> : null}
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
  onApplyAiDraft
}: {
  config: AlgoStrategyConfig;
  setConfig: React.Dispatch<React.SetStateAction<AlgoStrategyConfig>>;
  aiDraft: ReturnType<typeof draftFromChat>;
  selectedContract: ContractSummary;
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
                  {contractRows.slice(0, 80).map((contract) => <option key={contract.symbol}>{contract.symbol}</option>)}
                </select>
              </Field>
              <Field label="Current Context"><input value={`${selectedContract.name} · ${selectedContract.expiry}`} readOnly /></Field>
              <label className="check-row"><input type="checkbox" checked={config.advanced} onChange={(event) => update('advanced', event.target.checked)} /> Advanced</label>
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
                      <option>1 Minute</option><option>3 Minutes</option><option>5 Minutes</option><option>15 Minutes</option><option>1 Day</option>
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
                  <select value={leg.segment} onChange={(event) => updateLeg(index, { segment: event.target.value as AlgoLegConfig['segment'] })}><option>Open</option><option>Close</option></select>
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
              <div className="run-credit-box"><span>Required Credits</span><strong>{Math.max(1, config.legs.length)}</strong><button>Save Strategy</button></div>
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
          <input value={condition.right} onChange={(event) => onUpdate(index, { right: event.target.value })} />
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

function buildActivityRows(type: 'CE' | 'PE', sortBy: 'volume' | 'price' | 'oi') {
  const rows = Object.entries(optionChainsBySymbol).flatMap(([symbol, chain]) => {
    const contract = contractRows.find((item) => item.symbol === symbol);
    if (!contract) return [];
    return chain
      .filter((quote) => quote.type === type)
      .map((quote) => {
        const derived = optionQuoteRow(instrumentsBySymbol[symbol] ?? instrumentsBySymbol[defaultContract.symbol], quote);
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

function buildDashboardInsights(nifty: ContractSummary, bankNifty: ContractSummary) {
  return [
    `${nifty.symbol} is ${nifty.trend.toLowerCase()} with PCR ${nifty.pcr}; use Quick Trades to compare range and volatility structures.`,
    `${bankNifty.symbol} shows ${bankNifty.buildUp.toLowerCase()} and ${bankNifty.oiChangePct}% OI change; confirm with Combined OI before short premium.`,
    `${marketCharts.oiChangeLeaders[0]?.symbol ?? 'FINNIFTY'} leads OI change, so screeners should include build-up and liquidity filters.`,
    `Demo data is deterministic from ${dataSource.workbook}; Upstox live mode will reuse the same calculators.`
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

function buildScreenerResults(filters: Record<string, string>) {
  const wantsCalls = filters.instrument === 'Calls';
  const wantsPuts = filters.instrument === 'Puts';
  const minLiquidity = filters.liquidity === 'A only' ? 86 : 72;
  const rows = Object.entries(optionChainsBySymbol).flatMap(([symbol, chain]) => {
    const contract = contractRows.find((item) => item.symbol === symbol);
    if (!contract || contract.liquidity < minLiquidity) return [];
    if (filters.universe === 'Index Options' && !['NIFTY', 'BANKNIFTY', 'FINNIFTY', 'MIDCPNIFTY'].includes(symbol)) return [];
    if (filters.universe === 'Banking' && contract.industry !== 'Banks' && symbol !== 'BANKNIFTY') return [];
    return chain
      .filter((quote) => (wantsCalls ? quote.type === 'CE' : wantsPuts ? quote.type === 'PE' : true))
      .map((quote) => {
        const row = optionQuoteRow(instrumentsBySymbol[symbol] ?? instrumentsBySymbol[defaultContract.symbol], quote);
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
