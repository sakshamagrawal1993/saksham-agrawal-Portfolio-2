import React, { useState, useEffect, useRef } from 'react';
import { ArrowLeft, Play, TrendingUp, TrendingDown, Activity, Search, LayoutDashboard, Terminal, Zap, ChevronDown } from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';
import {
  AgentLog,
  TRADING_AGENTS_VPS_WS_URL,
  formatAgentLog,
  invokeTradingAgents,
  parsePortfolioDecision
} from './tradingAgentsApi';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../ui/select';

interface TradingAgentsAppProps {
  onBack: () => void;
}

type EquityInstrument = { symbol: string; name: string };

const US_INSTRUMENTS: EquityInstrument[] = [
  { symbol: 'AAPL', name: 'Apple Inc.' },
  { symbol: 'MSFT', name: 'Microsoft Corporation' },
  { symbol: 'NVDA', name: 'NVIDIA Corporation' },
  { symbol: 'GOOGL', name: 'Alphabet Inc. (Class A)' },
  { symbol: 'AMZN', name: 'Amazon.com Inc.' },
  { symbol: 'META', name: 'Meta Platforms Inc.' },
  { symbol: 'LLY', name: 'Eli Lilly and Company' },
  { symbol: 'TSLA', name: 'Tesla Inc.' },
  { symbol: 'AVGO', name: 'Broadcom Inc.' },
  { symbol: 'JPM', name: 'JPMorgan Chase & Co.' },
  { symbol: 'V', name: 'Visa Inc.' },
  { symbol: 'WMT', name: 'Walmart Inc.' },
  { symbol: 'UNH', name: 'UnitedHealth Group Incorporated' },
  { symbol: 'MA', name: 'Mastercard Incorporated' },
  { symbol: 'PG', name: 'The Procter & Gamble Company' },
  { symbol: 'JNJ', name: 'Johnson & Johnson' },
  { symbol: 'XOM', name: 'Exxon Mobil Corporation' },
  { symbol: 'HD', name: 'The Home Depot Inc.' },
  { symbol: 'MRK', name: 'Merck & Co. Inc.' },
  { symbol: 'COST', name: 'Costco Wholesale Corporation' },
  { symbol: 'ABBV', name: 'AbbVie Inc.' },
  { symbol: 'CVX', name: 'Chevron Corporation' },
  { symbol: 'CRM', name: 'Salesforce Inc.' },
  { symbol: 'AMD', name: 'Advanced Micro Devices Inc.' },
  { symbol: 'PEP', name: 'PepsiCo Inc.' },
  { symbol: 'BAC', name: 'Bank of America Corporation' },
  { symbol: 'NFLX', name: 'Netflix Inc.' },
  { symbol: 'LIN', name: 'Linde plc' },
  { symbol: 'KO', name: 'The Coca-Cola Company' },
  { symbol: 'TMO', name: 'Thermo Fisher Scientific Inc.' },
  { symbol: 'WFC', name: 'Wells Fargo & Company' },
  { symbol: 'ADBE', name: 'Adobe Inc.' },
  { symbol: 'DIS', name: 'The Walt Disney Company' },
  { symbol: 'INTC', name: 'Intel Corporation' },
  { symbol: 'CSCO', name: 'Cisco Systems Inc.' },
  { symbol: 'ABNB', name: 'Airbnb Inc.' },
  { symbol: 'MCD', name: "McDonald's Corporation" },
  { symbol: 'ABT', name: 'Abbott Laboratories' },
  { symbol: 'INTU', name: 'Intuit Inc.' },
  { symbol: 'QCOM', name: 'QUALCOMM Incorporated' },
  { symbol: 'DHR', name: 'Danaher Corporation' },
  { symbol: 'IBM', name: 'International Business Machines Corporation' },
  { symbol: 'CAT', name: 'Caterpillar Inc.' },
  { symbol: 'GE', name: 'GE Aerospace' },
  { symbol: 'VZ', name: 'Verizon Communications Inc.' },
  { symbol: 'TXN', name: 'Texas Instruments Incorporated' },
  { symbol: 'NOW', name: 'ServiceNow Inc.' },
  { symbol: 'AMAT', name: 'Applied Materials Inc.' },
  { symbol: 'PFE', name: 'Pfizer Inc.' },
  { symbol: 'ISRG', name: 'Intuitive Surgical Inc.' },
];

const IN_INSTRUMENTS: EquityInstrument[] = [
  { symbol: 'RELIANCE.NS', name: 'Reliance Industries Limited' },
  { symbol: 'TCS.NS', name: 'Tata Consultancy Services Limited' },
  { symbol: 'HDFCBANK.NS', name: 'HDFC Bank Limited' },
  { symbol: 'ICICIBANK.NS', name: 'ICICI Bank Limited' },
  { symbol: 'INFY.NS', name: 'Infosys Limited' },
  { symbol: 'ITC.NS', name: 'ITC Limited' },
  { symbol: 'SBIN.NS', name: 'State Bank of India' },
  { symbol: 'BHARTIARTL.NS', name: 'Bharti Airtel Limited' },
  { symbol: 'LT.NS', name: 'Larsen & Toubro Limited' },
  { symbol: 'BAJFINANCE.NS', name: 'Bajaj Finance Limited' },
  { symbol: 'HINDUNILVR.NS', name: 'Hindustan Unilever Limited' },
  { symbol: 'AXISBANK.NS', name: 'Axis Bank Limited' },
  { symbol: 'KOTAKBANK.NS', name: 'Kotak Mahindra Bank Limited' },
  { symbol: 'ASIANPAINT.NS', name: 'Asian Paints Limited' },
  { symbol: 'MARUTI.NS', name: 'Maruti Suzuki India Limited' },
  { symbol: 'SUNPHARMA.NS', name: 'Sun Pharmaceutical Industries Limited' },
  { symbol: 'TITAN.NS', name: 'Titan Company Limited' },
  { symbol: 'TATASTEEL.NS', name: 'Tata Steel Limited' },
  { symbol: 'NTPC.NS', name: 'NTPC Limited' },
  { symbol: 'M&M.NS', name: 'Mahindra & Mahindra Limited' },
  { symbol: 'ULTRACEMCO.NS', name: 'UltraTech Cement Limited' },
  { symbol: 'POWERGRID.NS', name: 'Power Grid Corporation of India Limited' },
  { symbol: 'JIOFIN.NS', name: 'Jio Financial Services Limited' },
  { symbol: 'ONGC.NS', name: 'Oil and Natural Gas Corporation Limited' },
  { symbol: 'NESTLEIND.NS', name: "Nestlé India Limited" },
  { symbol: 'JSWSTEEL.NS', name: 'JSW Steel Limited' },
  { symbol: 'GRASIM.NS', name: 'Grasim Industries Limited' },
  { symbol: 'TECHM.NS', name: 'Tech Mahindra Limited' },
  { symbol: 'ADANIENT.NS', name: 'Adani Enterprises Limited' },
  { symbol: 'HINDALCO.NS', name: 'Hindalco Industries Limited' },
  { symbol: 'WIPRO.NS', name: 'Wipro Limited' },
  { symbol: 'BAJAJFINSV.NS', name: 'Bajaj Finserv Limited' },
  { symbol: 'COALINDIA.NS', name: 'Coal India Limited' },
  { symbol: 'HDFCLIFE.NS', name: 'HDFC Life Insurance Company Limited' },
  { symbol: 'INDUSINDBK.NS', name: 'IndusInd Bank Limited' },
  { symbol: 'EICHERMOT.NS', name: 'Eicher Motors Limited' },
  { symbol: 'APOLLOHOSP.NS', name: 'Apollo Hospitals Enterprise Limited' },
  { symbol: 'DIVISLAB.NS', name: "Divi's Laboratories Limited" },
  { symbol: 'BRITANNIA.NS', name: 'Britannia Industries Limited' },
  { symbol: 'DRREDDY.NS', name: "Dr. Reddy's Laboratories Limited" },
  { symbol: 'BAJAJ-AUTO.NS', name: 'Bajaj Auto Limited' },
  { symbol: 'HEROMOTOCO.NS', name: 'Hero MotoCorp Limited' },
  { symbol: 'CIPLA.NS', name: 'Cipla Limited' },
  { symbol: 'SBILIFE.NS', name: 'SBI Life Insurance Company Limited' },
  { symbol: 'BEL.NS', name: 'Bharat Electronics Limited' },
  { symbol: 'TATACONSUM.NS', name: 'Tata Consumer Products Limited' },
  { symbol: 'UPL.NS', name: 'UPL Limited' },
  { symbol: 'BPCL.NS', name: 'Bharat Petroleum Corporation Limited' },
  { symbol: 'ADANIPORTS.NS', name: 'Adani Ports and Special Economic Zone Limited' },
  { symbol: 'TATAPOWER.NS', name: 'Tata Power Company Limited' },
];

// Top 20 Crypto by market cap (excl stablecoins). Binance symbol format.
const TOP_20_CRYPTO = [
  { symbol: 'BTCUSDT',  name: 'Bitcoin',       display: 'BTC' },
  { symbol: 'ETHUSDT',  name: 'Ethereum',      display: 'ETH' },
  { symbol: 'BNBUSDT',  name: 'BNB',           display: 'BNB' },
  { symbol: 'SOLUSDT',  name: 'Solana',        display: 'SOL' },
  { symbol: 'XRPUSDT',  name: 'Ripple',        display: 'XRP' },
  { symbol: 'ADAUSDT',  name: 'Cardano',       display: 'ADA' },
  { symbol: 'AVAXUSDT', name: 'Avalanche',     display: 'AVAX'},
  { symbol: 'DOGEUSDT', name: 'Dogecoin',      display: 'DOGE'},
  { symbol: 'TRXUSDT',  name: 'TRON',          display: 'TRX' },
  { symbol: 'TONUSDT',  name: 'Toncoin',       display: 'TON' },
  { symbol: 'SHIBUSDT', name: 'Shiba Inu',     display: 'SHIB'},
  { symbol: 'LINKUSDT', name: 'Chainlink',     display: 'LINK'},
  { symbol: 'DOTUSDT',  name: 'Polkadot',      display: 'DOT' },
  { symbol: 'MATICUSDT',name: 'Polygon',       display: 'MATIC'},
  { symbol: 'LTCUSDT',  name: 'Litecoin',      display: 'LTC' },
  { symbol: 'BCHUSDT',  name: 'Bitcoin Cash',  display: 'BCH' },
  { symbol: 'UNIUSDT',  name: 'Uniswap',       display: 'UNI' },
  { symbol: 'NEARUSDT', name: 'NEAR Protocol', display: 'NEAR'},
  { symbol: 'APTUSDT',  name: 'Aptos',         display: 'APT' },
  { symbol: 'ARBUSDT',  name: 'Arbitrum',      display: 'ARB' },
];

const TOP_50_US = US_INSTRUMENTS.map((i) => i.symbol);
const TOP_50_IN = IN_INSTRUMENTS.map((i) => i.symbol);

const EQUITY_NAME_BY_SYMBOL: Record<string, string> = Object.fromEntries([
  ...US_INSTRUMENTS.map((i) => [i.symbol, i.name] as const),
  ...IN_INSTRUMENTS.map((i) => [i.symbol, i.name] as const),
]);

function cryptoMeta(symbol: string) {
  return TOP_20_CRYPTO.find((c) => c.symbol === symbol);
}

function instrumentPrimaryLabel(symbol: string, market: 'US' | 'IN' | 'CRYPTO') {
  if (market === 'CRYPTO') return cryptoMeta(symbol)?.display ?? symbol;
  return symbol;
}

function instrumentSecondaryLabel(symbol: string, market: 'US' | 'IN' | 'CRYPTO'): string | null {
  if (market === 'CRYPTO') return cryptoMeta(symbol)?.name ?? null;
  return EQUITY_NAME_BY_SYMBOL[symbol] ?? null;
}

/** Single row: human name (sans) + trading symbol (mono). Used in Radix Select trigger/items. */
function ActiveTickerSelectRow({
  symbol,
  market,
}: {
  symbol: string;
  market: 'US' | 'IN' | 'CRYPTO';
}) {
  if (market === 'CRYPTO') {
    const c = cryptoMeta(symbol);
    return (
      <span className="flex min-w-0 w-full items-center gap-2 text-left">
        <span className="min-w-0 flex-1 truncate font-sans text-sm font-normal text-[#2C2A26]">
          {c?.name ?? symbol}
        </span>
        <span className="shrink-0 font-mono text-sm font-semibold text-[#2C2A26] tabular-nums">
          {symbol}
        </span>
      </span>
    );
  }
  const nm = EQUITY_NAME_BY_SYMBOL[symbol];
  return (
    <span className="flex min-w-0 w-full items-center gap-2 text-left">
      {nm ? (
        <span className="min-w-0 flex-1 truncate font-sans text-sm font-normal text-[#2C2A26]">{nm}</span>
      ) : (
        <span className="min-w-0 flex-1 truncate font-sans text-sm text-[#A8A29E]">—</span>
      )}
      <span className="shrink-0 font-mono text-sm font-semibold text-[#2C2A26] tabular-nums">{symbol}</span>
    </span>
  );
}

/** Resolve legal/display name when market tab is unknown (e.g. history). */
function resolveInstrumentName(symbol: string): string | undefined {
  const c = cryptoMeta(symbol);
  if (c) return c.name;
  return EQUITY_NAME_BY_SYMBOL[symbol];
}

/** Mon–Fri NYSE regular session 09:30–16:00 America/New_York (handles DST). */
function isNYSERegularSessionOpen(now = new Date()): boolean {
  const day = now.toLocaleDateString('en-US', { timeZone: 'America/New_York', weekday: 'short' });
  if (day.startsWith('Sat') || day.startsWith('Sun')) return false;
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    hour: 'numeric',
    minute: 'numeric',
    hour12: false,
  }).formatToParts(now);
  const hour = Number(parts.find((p) => p.type === 'hour')?.value);
  const minute = Number(parts.find((p) => p.type === 'minute')?.value);
  if (Number.isNaN(hour) || Number.isNaN(minute)) return false;
  const mins = hour * 60 + minute;
  return mins >= 9 * 60 + 30 && mins < 16 * 60;
}

/** NSE cash session Mon–Fri 09:15–15:30 Asia/Kolkata. */
function isNSESessionOpen(now = new Date()): boolean {
  const day = now.toLocaleDateString('en-US', { timeZone: 'Asia/Kolkata', weekday: 'short' });
  if (day.startsWith('Sat') || day.startsWith('Sun')) return false;
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Kolkata',
    hour: 'numeric',
    minute: 'numeric',
    hour12: false,
  }).formatToParts(now);
  const hour = Number(parts.find((p) => p.type === 'hour')?.value);
  const minute = Number(parts.find((p) => p.type === 'minute')?.value);
  if (Number.isNaN(hour) || Number.isNaN(minute)) return false;
  const mins = hour * 60 + minute;
  return mins >= 9 * 60 + 15 && mins < 15 * 60 + 30;
}

function formatCap(n: number | undefined): string {
  if (n == null || Number.isNaN(n)) return '—';
  if (n >= 1e12) return `${(n / 1e12).toFixed(2)}T`;
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  return n.toFixed(0);
}

/** Yahoo / yfinance: usually decimal (e.g. 0.0038 = 0.38%). If value looks like percent already (>1), show as-is. */
function formatDividendYield(v: number): string {
  if (Number.isNaN(v)) return '—';
  const pct = v > 1 ? v : v * 100;
  return `${pct.toFixed(2)}%`;
}

const VPS_PROFILE_CACHE_MS = 10 * 60 * 1000;

/** Compact fundamentals block for expanded watchlist row (equity only). */
function WatchlistExpandedFundamentals({
  data,
  error,
  loading,
}: {
  data: Record<string, unknown> | undefined;
  error: string | undefined;
  loading: boolean;
}) {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-3 text-[10px] uppercase tracking-widest text-[#A8A29E]">
        Loading fundamentals…
      </div>
    );
  }
  if (error) {
    return (
      <div className="rounded-sm border border-amber-200 bg-amber-50 px-2 py-2 text-[10px] text-amber-950">
        {error}
      </div>
    );
  }
  if (!data) return null;
  const summary = typeof data.summary === 'string' ? data.summary : '';
  return (
    <div className="space-y-2 text-left">
      {(typeof data.sector === 'string' || typeof data.industry === 'string') && (
        <p className="text-[10px] font-semibold text-[#5D5A53]">
          {[data.sector, data.industry].filter(Boolean).join(' · ')}
        </p>
      )}
      <div className="grid grid-cols-2 gap-1.5 text-[10px]">
        <div className="rounded-sm bg-white/80 border border-[#EBE7DE] px-2 py-1">
          <span className="text-[#A8A29E] uppercase tracking-tighter">P/E</span>
          <p className="font-mono font-bold text-[#2C2A26]">
            {typeof data.pe === 'number' && !Number.isNaN(data.pe) ? data.pe.toFixed(2) : '—'}
          </p>
        </div>
        <div className="rounded-sm bg-white/80 border border-[#EBE7DE] px-2 py-1">
          <span className="text-[#A8A29E] uppercase tracking-tighter">Mkt cap</span>
          <p className="font-mono font-bold text-[#2C2A26]">
            {formatCap(typeof data.marketCap === 'number' ? data.marketCap : undefined)}
          </p>
        </div>
      </div>
      {summary ? (
        <p className="text-[11px] leading-snug text-[#433E38] line-clamp-4 border-l-2 border-[#D6D3C9] pl-2">
          {summary}
        </p>
      ) : null}
    </div>
  );
}

function FeedStatusPill({
  market,
  yhWsStatus,
  wsStatus,
}: {
  market: 'US' | 'IN' | 'CRYPTO';
  yhWsStatus: 'disconnected' | 'connecting' | 'connected';
  wsStatus: 'disconnected' | 'connecting' | 'connected';
}) {
  if (market === 'CRYPTO') {
    if (wsStatus === 'connecting') {
      return <span className="text-xs font-bold text-amber-600">Connecting…</span>;
    }
    if (wsStatus === 'connected') {
      return <span className="text-xs font-bold text-emerald-600">Connected · Binance</span>;
    }
    return <span className="text-xs font-bold text-red-600">Unable to connect</span>;
  }
  if (market === 'IN') {
    if (yhWsStatus === 'connecting') {
      return <span className="text-xs font-bold text-amber-600">Connecting…</span>;
    }
    if (yhWsStatus === 'connected') {
      return <span className="text-xs font-bold text-emerald-600">Connected · VPS</span>;
    }
    return <span className="text-xs font-bold text-red-600">Unable to connect</span>;
  }
  const connected = yhWsStatus === 'connected' || wsStatus === 'connected';
  const connecting = !connected && (yhWsStatus === 'connecting' || wsStatus === 'connecting');
  if (connecting) {
    return <span className="text-xs font-bold text-amber-600">Connecting…</span>;
  }
  if (yhWsStatus === 'connected') {
    return <span className="text-xs font-bold text-emerald-600">Connected · VPS</span>;
  }
  if (wsStatus === 'connected') {
    return <span className="text-xs font-bold text-emerald-600">Connected · Finnhub</span>;
  }
  return <span className="text-xs font-bold text-red-600">Unable to connect</span>;
}

export default function TradingAgentsApp({ onBack }: TradingAgentsAppProps) {
  const [market, setMarket] = useState<'US' | 'IN' | 'CRYPTO'>('US');
  const [ticker, setTicker] = useState('AAPL');
  const [isRunning, setIsRunning] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [logs, setLogs] = useState<{ id: string, agent: string, message: string, time: string }[]>([]);
  const [finalDecision, setFinalDecision] = useState<any>(null);

  // History State
  const [activeTab, setActiveTab] = useState<'watchlist' | 'history' | 'scorecard'>('watchlist');
  const [historySessions, setHistorySessions] = useState<any[]>([]);
  const [selectedHistorySession, setSelectedHistorySession] = useState<any>(null);
  const [historyLogs, setHistoryLogs] = useState<{ id: string, agent: string, message: string, time: string }[]>([]);

  // Recon State
  const [isReconning, setIsReconning] = useState(false);
  const [activeOpportunities, setActiveOpportunities] = useState<string[]>([]);

  // Scorecard State
  const [scorecardStats, setScorecardStats] = useState({ wins: 0, losses: 0, rate: 0 });
  const [lessons, setLessons] = useState<any[]>([]);
  /** On-demand profile from VPS yfinance `/research` (same data shape as deep_research). */
  const [vpsProfile, setVpsProfile] = useState<Record<string, unknown> | null>(null);
  const [vpsProfileError, setVpsProfileError] = useState<string | null>(null);
  const [isVpsProfileLoading, setIsVpsProfileLoading] = useState(false);
  const [vpsProfileOpen, setVpsProfileOpen] = useState(false);
  const profileCacheRef = useRef<Map<string, { at: number; data: Record<string, unknown> }>>(new Map());

  /** Watchlist row expand + cached fundamentals per symbol (yfinance via Edge). */
  const [watchlistExpanded, setWatchlistExpanded] = useState<Record<string, boolean>>({});
  const [watchlistFundamentals, setWatchlistFundamentals] = useState<Record<string, Record<string, unknown>>>({});
  const [watchlistFundErr, setWatchlistFundErr] = useState<Record<string, string>>({});
  const [watchlistFundLoading, setWatchlistFundLoading] = useState<Record<string, boolean>>({});

  /** Live log channel for the active run (subscribe before Edge invoke to avoid missing early INSERTs). */
  const logChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  useEffect(() => {
    if (activeTab !== 'scorecard') return;

    const fetchScorecard = async () => {
      // Fetch stats
      const { data: sessions } = await supabase
        .from('trading_sessions')
        .select('outcome')
        .not('outcome', 'is', null);

      if (sessions && sessions.length > 0) {
        let w = 0; let l = 0;
        sessions.forEach(s => {
          if (s.outcome === 'WIN') w++;
          if (s.outcome === 'LOSS') l++;
        });
        setScorecardStats({ wins: w, losses: l, rate: (w + l) > 0 ? Math.round((w / (w + l)) * 100) : 0 });
      }

      // Fetch lessons
      const { data: lessonsData } = await supabase
        .from('agent_lessons')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(10);
      
      if (lessonsData) {
         setLessons(lessonsData);
      }
    };

    fetchScorecard();
  }, [activeTab]);
  
  

  // Live Price State (Yahoo for IN, Finnhub WS for US, Binance WS for CRYPTO)
  const [activeQuote, setActiveQuote] = useState<any>(null);
  const [isFetchingPrice, setIsFetchingPrice] = useState(false);
  
  // WebSocket State (US/Crypto)
  const livePricesRef = useRef<Record<string, { price: number, prev: number, time: number, isRest?: boolean, open?: number }>>({});
  const [wsPrices, setWsPrices] = useState<Record<string, { price: number, prev: number, time: number, isRest?: boolean, open?: number }>>({});
  const [wsStatus, setWsStatus] = useState<'disconnected' | 'connecting' | 'connected'>('connecting');
  const [yhWsStatus, setYhWsStatus] = useState<'disconnected' | 'connecting' | 'connected'>('connecting');

  const watchlists: Record<string, string[]> = {
    US: TOP_50_US,
    IN: TOP_50_IN,
    CRYPTO: TOP_20_CRYPTO.map(c => c.symbol),
  };


  useEffect(() => {
    // Reset ticker when switching markets
    setTicker(watchlists[market][0]);
    setWatchlistExpanded({});
    setWatchlistFundamentals({});
    setWatchlistFundErr({});
    setWatchlistFundLoading({});
  }, [market]);

  useEffect(() => {
    setYhWsStatus('connecting');
    setWsStatus('connecting');
  }, [market]);

  useEffect(() => {
    setVpsProfile(null);
    setVpsProfileError(null);
    setVpsProfileOpen(false);
  }, [ticker]);

  useEffect(() => {
    if (activeTab === 'history') {
      const fetchHistory = async () => {
        const { data } = await supabase
          .from('trading_sessions')
          .select('*')
          .order('created_at', { ascending: false });
        if (data) setHistorySessions(data);
      };
      fetchHistory();
    }
  }, [activeTab]);

  const handleSelectHistory = async (session: any) => {
    setSelectedHistorySession(session);
    setHistoryLogs([]);
    const { data } = await supabase
      .from('trading_logs')
      .select('*')
      .eq('session_id', session.id)
      .order('created_at', { ascending: true });
      
    if (data) {
       const formattedLogs = data.map(formatAgentLog);
       setHistoryLogs(formattedLogs);
       
       const finalLog = data.find(l => l.agent_role === 'Portfolio Manager' && l.content.includes('decision'));
       if (finalLog) {
         const decisionData = parsePortfolioDecision(finalLog.content);
         setSelectedHistorySession((prev: any) => ({
           ...prev,
           decision: decisionData?.decision || 'HOLD',
           thesis: decisionData?.thesis || finalLog.content,
           confidence: decisionData?.confidence || 'Medium'
         }));
       }
    }
  };

  const isMarketOpen = () => isNYSERegularSessionOpen();

  // Fetch REST fallback prices from proxy (which calls FMP/Polygon server-side)
  const fetchRestPrices = async (tickers: string[]) => {
    try {
      const symbols = tickers.join(',');
      const data = await invokeTradingAgents<{ quotes?: any[] }>({ action: 'batch_quote', symbols });
      if (Array.isArray(data.quotes)) {
        data.quotes.forEach((q: any) => {
          if (q.symbol && q.price) {
            livePricesRef.current[q.symbol] = {
              price: q.price,
              prev: q.price,
              time: Date.now(),
              isRest: true
            };
          }
        });
        setWsPrices({...livePricesRef.current});
      }
    } catch (e) {
      console.error('REST price fallback failed', e);
    }
  };

  // Sync WS ref to React state (VPS/Finnhub tick coalescing). Crypto uses its own faster interval.
  useEffect(() => {
    if (market === 'CRYPTO') return;
    const interval = setInterval(() => {
      setWsPrices({ ...livePricesRef.current });
    }, 200);
    return () => clearInterval(interval);
  }, [market]);

  // --- VPS WebSocket Bridge (Primary for US + IN) ---
  useEffect(() => {
    if (market === 'CRYPTO') {
      setYhWsStatus('disconnected');
      return;
    }

    setYhWsStatus('connecting');
    const vpsWsUrl = TRADING_AGENTS_VPS_WS_URL;
    if (!vpsWsUrl) {
      setYhWsStatus('disconnected');
      return;
    }

    let socket: WebSocket;
    let connectTimer: ReturnType<typeof setTimeout> | null = null;

    const applyVpsUpdates = (updates: Record<string, any>) => {
      const newPrices = { ...livePricesRef.current };
      Object.entries(updates).forEach(([sym, update]) => {
        const price =
          typeof update === 'number'
            ? update
            : update?.price ?? update?.p ?? update?.last;
        if (price == null || Number.isNaN(Number(price))) return;
        const n = Number(price);
        newPrices[sym] = {
          price: n,
          prev: livePricesRef.current[sym]?.price ?? n,
          time: typeof update === 'object' && update?.time != null ? update.time : Date.now(),
          isRest: false,
        };
      });
      if (Object.keys(newPrices).length === 0) return;
      livePricesRef.current = newPrices;
      setWsPrices({ ...livePricesRef.current });
    };

    try {
      socket = new WebSocket(vpsWsUrl);

      connectTimer = setTimeout(() => {
        if (socket.readyState !== WebSocket.OPEN) {
          try {
            socket.close();
          } catch {
            /* ignore */
          }
          setYhWsStatus('disconnected');
        }
      }, 10000);

      socket.onopen = () => {
        if (connectTimer) {
          clearTimeout(connectTimer);
          connectTimer = null;
        }
        setYhWsStatus('connected');
        const tickers = market === 'US' ? TOP_50_US : TOP_50_IN;
        try {
          socket.send(JSON.stringify({ tickers }));
        } catch (e) {
          console.error('VPS WS subscribe failed', e);
        }
      };

      socket.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === 'update' && msg.data && typeof msg.data === 'object') {
            applyVpsUpdates(msg.data as Record<string, any>);
            return;
          }
          if (msg.data && typeof msg.data === 'object' && !msg.type) {
            applyVpsUpdates(msg.data as Record<string, any>);
            return;
          }
        } catch (e) {
          console.warn('VPS WS message parse error', e);
        }
      };

      socket.onclose = () => {
        if (connectTimer) clearTimeout(connectTimer);
        setYhWsStatus('disconnected');
      };
      socket.onerror = () => {
        if (connectTimer) clearTimeout(connectTimer);
        setYhWsStatus('disconnected');
      };

      return () => {
        if (connectTimer) clearTimeout(connectTimer);
        try {
          socket.close();
        } catch {
          /* ignore */
        }
      };
    } catch (e) {
      console.error('Failed to connect to VPS WS', e);
      setYhWsStatus('disconnected');
    }
  }, [market]);

  // REST fallback: fetch prices for US (when market closed) and Indian market
  useEffect(() => {
    if (market === 'CRYPTO') return; // Crypto uses Binance WS
    
    let tickers: string[] = [];
    if (market === 'US') {
      // US Backup: Only poll if both VPS and Finnhub are down OR market closed
      if (yhWsStatus === 'connected') return;
      if (isMarketOpen() && wsStatus === 'connected') return;
      tickers = TOP_50_US.slice(0, 25);
    } else if (market === 'IN') {
      // Indian Backup: Only poll if VPS is down
      if (yhWsStatus === 'connected') return;
      tickers = TOP_50_IN;
    }
    
    if (tickers.length === 0) return;
    
    // Clear old prices from different market
    livePricesRef.current = {};
    setWsPrices({});
    
    fetchRestPrices(tickers);
    const interval = setInterval(() => fetchRestPrices(tickers), 5 * 60 * 1000); // Refresh every 5 min
    return () => clearInterval(interval);
  }, [market, yhWsStatus, wsStatus]);

  // IN market hole-filler: if VPS stream misses some NSE symbols, backfill them via REST.
  useEffect(() => {
    if (market !== 'IN') return;
    if (yhWsStatus !== 'connected') return; // Full fallback already handled when disconnected.

    const fillMissing = () => {
      const known = livePricesRef.current;
      const missing = TOP_50_IN.filter((sym) => !known[sym]).slice(0, 15);
      if (missing.length === 0) return;
      fetchRestPrices(missing);
    };

    fillMissing();
    const interval = setInterval(fillMissing, 60 * 1000);
    return () => clearInterval(interval);
  }, [market, yhWsStatus]);

  // Initialize Finnhub WebSocket for US Market (Tier 2 Backup)
  useEffect(() => {
    if (market !== 'US') return;
    // If VPS is already handling US stream, don't waste Finnhub credits
    if (yhWsStatus === 'connected') {
      setWsStatus('disconnected');
      return;
    }
    
    let ws: WebSocket;
    setWsStatus('connecting');

    const initWs = async () => {
      try {
        const data = await invokeTradingAgents<{ token?: string }>({ action: 'get_finnhub_token' });
        
        if (!data.token) {
           console.error("No Finnhub token returned.");
           setWsStatus('disconnected');
           return;
        }

        ws = new WebSocket(`wss://ws.finnhub.io?token=${data.token}`);
        
        ws.addEventListener('open', function (event) {
          setWsStatus('connected');
          // Subscribe to all 50 tickers
          TOP_50_US.forEach(t => {
            ws.send(JSON.stringify({'type':'subscribe', 'symbol': t}));
          });
        });

        ws.addEventListener('message', function (event) {
          try {
            const msg = JSON.parse(event.data);
            if (msg.type === 'trade') {
              msg.data.forEach((trade: any) => {
                const sym = trade.s;
                const current = livePricesRef.current[sym];
                // Store prev price to calculate flash direction (green/red)
                livePricesRef.current[sym] = {
                  price: trade.p,
                  prev: current ? current.price : trade.p,
                  time: trade.t
                };
              });
            }
          } catch (e) {
             console.error("WS parse error:", e);
          }
        });
        
        ws.addEventListener('close', () => setWsStatus('disconnected'));
      } catch(err) { 
        setWsStatus('disconnected');
      }
    };
    
    initWs();
    
    return () => {
      if (ws && ws.readyState === WebSocket.OPEN) {
        // Unsubscribe
        TOP_50_US.forEach(t => {
            ws.send(JSON.stringify({'type':'unsubscribe', 'symbol': t}));
        });
        ws.close();
      }
    }
  }, [market, yhWsStatus]);

  // Binance WebSocket for Crypto (no API key needed)
  useEffect(() => {
    if (market !== 'CRYPTO') return;
    setWsStatus('connecting');
    livePricesRef.current = {}; // clear old US prices

    const streams = TOP_20_CRYPTO.map(c => `${c.symbol.toLowerCase()}@miniTicker`).join('/');
    const ws = new WebSocket(`wss://stream.binance.com:9443/stream?streams=${streams}`);

    ws.addEventListener('open', () => setWsStatus('connected'));
    ws.addEventListener('close', () => setWsStatus('disconnected'));
    ws.addEventListener('message', (event) => {
      try {
        const msg = JSON.parse(event.data);
        const d = msg.data; // miniTicker stream wraps in { stream, data }
        if (d && d.s && d.c) {
          const current = livePricesRef.current[d.s];
          livePricesRef.current[d.s] = {
            price: parseFloat(d.c),
            prev: current ? current.price : parseFloat(d.c),
            open: parseFloat(d.o), // 24h open for change calculation
            time: d.E,
          };
        }
      } catch (e) {}
    });

    const interval = setInterval(() => setWsPrices({...livePricesRef.current}), 500);

    return () => {
      ws.close();
      clearInterval(interval);
    };
  }, [market]);

  // Active Quote Fetcher (Yahoo fallback for Indian Market)
  useEffect(() => {
    if (market === 'US') {
       // Using WS for US, no need to fetch active quote unless we want daily change. 
       // For this demo, we'll just rely on WS prices.
       return;
    }

    const fetchQuote = async () => {
      if (!ticker) return;
      setIsFetchingPrice(true);
      try {
        const data = await invokeTradingAgents<any>({ action: 'quote', ticker });
        setActiveQuote(data);
      } catch (err) {
        setActiveQuote(null);
      } finally {
        setIsFetchingPrice(false);
      }
    };

    const delayDebounceFn = setTimeout(() => { fetchQuote(); }, 500);
    return () => clearTimeout(delayDebounceFn);
  }, [ticker, market]);

  useEffect(() => {
    return () => {
      if (logChannelRef.current) {
        supabase.removeChannel(logChannelRef.current);
        logChannelRef.current = null;
      }
    };
  }, []);

  const fetchVpsProfileFromNetwork = async (sym: string) => {
    const data = await invokeTradingAgents<Record<string, unknown>>({
      action: 'vps_yfinance_research',
      ticker: sym,
    });
    const err = typeof data?.error === 'string' ? data.error : null;
    if (err) {
      throw new Error(err);
    }
    profileCacheRef.current.set(sym, { at: Date.now(), data });
    return data;
  };

  const handleLoadVpsProfile = async (symbol?: string, opts?: { skipCache?: boolean }) => {
    const sym = symbol ?? ticker;
    if (!sym || market === 'CRYPTO') return;

    if (opts?.skipCache) {
      profileCacheRef.current.delete(sym);
    }

    if (!opts?.skipCache) {
      const hit = profileCacheRef.current.get(sym);
      if (hit && Date.now() - hit.at < VPS_PROFILE_CACHE_MS) {
        setVpsProfile(hit.data);
        setVpsProfileError(null);
        setVpsProfileOpen(true);
        return;
      }
    }

    setIsVpsProfileLoading(true);
    setVpsProfileError(null);
    try {
      const data = await fetchVpsProfileFromNetwork(sym);
      setVpsProfile(data);
      setVpsProfileOpen(true);
    } catch (e: unknown) {
      setVpsProfile(null);
      setVpsProfileError(e instanceof Error ? e.message : 'Could not load profile');
      setVpsProfileOpen(true);
    } finally {
      setIsVpsProfileLoading(false);
    }
  };

  const loadWatchlistFundamentals = async (sym: string, opts?: { skipCache?: boolean }) => {
    if (!sym || market === 'CRYPTO') return;

    if (!opts?.skipCache) {
      const hit = profileCacheRef.current.get(sym);
      if (hit && Date.now() - hit.at < VPS_PROFILE_CACHE_MS) {
        setWatchlistFundamentals((p) => ({ ...p, [sym]: hit.data }));
        setWatchlistFundErr((p) => {
          const n = { ...p };
          delete n[sym];
          return n;
        });
        return;
      }
    }

    setWatchlistFundLoading((p) => ({ ...p, [sym]: true }));
    setWatchlistFundErr((p) => {
      const n = { ...p };
      delete n[sym];
      return n;
    });
    try {
      const data = await fetchVpsProfileFromNetwork(sym);
      setWatchlistFundamentals((p) => ({ ...p, [sym]: data }));
    } catch (e: unknown) {
      setWatchlistFundErr((p) => ({
        ...p,
        [sym]: e instanceof Error ? e.message : 'Could not load profile',
      }));
    } finally {
      setWatchlistFundLoading((p) => ({ ...p, [sym]: false }));
    }
  };

  const toggleWatchlistFundamentals = (e: React.MouseEvent, sym: string) => {
    e.stopPropagation();
    setWatchlistExpanded((prev) => {
      const opening = !prev[sym];
      if (opening && market !== 'CRYPTO') {
        queueMicrotask(() => void loadWatchlistFundamentals(sym));
      }
      return { ...prev, [sym]: opening };
    });
  };

  const handleRunAnalysis = async () => {
    const runTicker = ticker;
    setIsRunning(true);
    setActiveTab('watchlist');
    setLogs([]);
    setFinalDecision(null);

    if (logChannelRef.current) {
      supabase.removeChannel(logChannelRef.current);
      logChannelRef.current = null;
    }

    const newSessionId = crypto.randomUUID();
    setSessionId(newSessionId);

    setLogs([
      {
        id: Date.now().toString(),
        agent: 'System',
        message: `Subscribing to live logs for ${runTicker}…`,
        time: new Date().toLocaleTimeString(),
      },
    ]);

    const channel = supabase
      .channel(`logs-${newSessionId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'trading_logs',
          filter: `session_id=eq.${newSessionId}`,
        },
        (payload) => {
          const newLog = payload.new as AgentLog;
          setLogs((prev) => [...prev, formatAgentLog(newLog)]);
          if (newLog.agent_role === 'Portfolio Manager' && newLog.content.includes('decision')) {
            setIsRunning(false);
            const decisionData = parsePortfolioDecision(newLog.content);
            setFinalDecision({
              ticker: runTicker,
              decision: decisionData?.decision || 'HOLD',
              confidence: decisionData?.confidence || 'Medium',
              thesis: decisionData?.thesis || newLog.content,
            });
          }
        }
      );

    try {
      await new Promise<void>((resolve, reject) => {
        const slow = setTimeout(() => {
          console.warn('Realtime log subscription slow; continuing run.');
          resolve();
        }, 8000);
        channel.subscribe((status, err) => {
          if (status === 'SUBSCRIBED') {
            clearTimeout(slow);
            resolve();
          } else if (status === 'CHANNEL_ERROR') {
            clearTimeout(slow);
            reject(err ?? new Error('Realtime channel error'));
          }
        });
      });
    } catch (e) {
      console.warn('Realtime subscription issue', e);
    }

    logChannelRef.current = channel;

    setLogs((prev) => [
      ...prev,
      {
        id: (Date.now() + 1).toString(),
        agent: 'System',
        message: `Triggering secure Edge Function for ${runTicker}…`,
        time: new Date().toLocaleTimeString(),
      },
    ]);

    try {
      const currentPrice = wsPrices[runTicker]?.price || activeQuote?.price || 0;

      await invokeTradingAgents<{ success?: boolean; queued?: boolean }>({
        action: 'run',
        ticker: runTicker,
        session_id: newSessionId,
        execution_price: currentPrice,
      });
    } catch (error: any) {
      console.error(error);
      setLogs((prev) => [
        ...prev,
        {
          id: Date.now().toString(),
          agent: 'System',
          message: `Error: ${error.message}`,
          time: new Date().toLocaleTimeString(),
        },
      ]);
      setIsRunning(false);
    }
  };

  const handleRunRecon = async () => {
    setIsReconning(true);
    setActiveOpportunities([]);
    try {
      // Pass the entire watchlist to the recon screener
      const data = await invokeTradingAgents<{ opportunities?: string[] }>({
        action: 'recon',
        tickers: watchlists[market].slice(0, 15).join(',')
      });
      if (data.opportunities) {
         setActiveOpportunities(data.opportunities);
      }
    } catch (e) {
      console.error("Recon failed", e);
    } finally {
      setIsReconning(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F5F2EB] text-[#2C2A26] font-sans pb-12">
      {/* Header */}
      <header className="border-b border-[#EBE7DE] bg-[#F5F2EB] px-6 py-4 flex items-center justify-between sticky top-0 z-50">
        <div className="flex items-center gap-4">
          <button 
            onClick={onBack}
            className="p-2 hover:bg-[#EBE7DE] rounded-sm transition-colors text-[#5D5A53] hover:text-[#2C2A26]"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-sm bg-[#2C2A26] text-[#F5F2EB] flex items-center justify-center">
              <Activity className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-[#2C2A26] font-serif font-medium text-lg tracking-wide">Trading Agents</h1>
              <p className="text-[10px] text-[#A8A29E] uppercase tracking-widest font-bold">Research Hub</p>
            </div>
          </div>
        </div>

        {/* Market Tabs */}
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 shrink-0">
            {market === 'CRYPTO' ? <Activity className="w-3.5 h-3.5 text-[#5D5A53]" /> : <Zap className="w-3.5 h-3.5 text-[#5D5A53]" />}
            <FeedStatusPill market={market} yhWsStatus={yhWsStatus} wsStatus={wsStatus} />
          </div>
          <div className="flex bg-[#EBE7DE] p-1 rounded-sm">
            <button
              onClick={() => setMarket('US')}
              className={`px-4 py-1.5 text-xs font-bold uppercase tracking-widest transition-colors rounded-sm ${
                market === 'US' ? 'bg-[#2C2A26] text-[#F5F2EB]' : 'text-[#5D5A53] hover:text-[#2C2A26]'
              }`}
            >
              US Market
            </button>
            <button
              onClick={() => setMarket('IN')}
              className={`px-4 py-1.5 text-xs font-bold uppercase tracking-widest transition-colors rounded-sm ${
                market === 'IN' ? 'bg-[#2C2A26] text-[#F5F2EB]' : 'text-[#5D5A53] hover:text-[#2C2A26]'
              }`}
            >
              Indian Market
            </button>
            <button
              onClick={() => setMarket('CRYPTO')}
              className={`px-4 py-1.5 text-xs font-bold uppercase tracking-widest transition-colors rounded-sm ${
                market === 'CRYPTO' ? 'bg-[#F59E0B] text-white' : 'text-[#5D5A53] hover:text-[#2C2A26]'
              }`}
            >
              ₿ Crypto
            </button>
          </div>
        </div>
      </header>

      <div className="p-6 grid grid-cols-12 gap-8 max-w-[1800px] mx-auto">
        {/* Left Sidebar - Watchlist & Controls */}
        <div className="col-span-12 lg:col-span-3 space-y-8">
          <div className="border border-[#2C2A26] bg-white p-6 shadow-[4px_4px_0px_0px_rgba(44,42,38,1)]">
            <div className="mb-4">
              <h2 className="text-xs uppercase tracking-widest text-[#2C2A26] font-bold flex items-center gap-2">
                <Search className="w-4 h-4" /> Active Ticker
              </h2>
            </div>
            <div className="relative mb-4">
              <Select value={ticker} onValueChange={setTicker}>
                <SelectTrigger
                  className="h-auto min-h-[52px] w-full rounded-sm border border-[#EBE7DE] bg-[#F5F2EB] px-4 py-3 text-[#2C2A26] shadow-none hover:bg-[#F5F2EB] focus:ring-2 focus:ring-[#2C2A26] focus:ring-offset-0 data-[state=open]:border-[#2C2A26] [&>span]:line-clamp-none [&>span]:flex [&>span]:min-w-0 [&>span]:flex-1 [&>span]:items-center"
                >
                  <SelectValue placeholder="Select ticker" />
                </SelectTrigger>
                <SelectContent
                  position="popper"
                  className="z-[100] max-h-[min(22rem,var(--radix-select-content-available-height))] rounded-sm border border-[#2C2A26] bg-white text-[#2C2A26] shadow-[4px_4px_0px_0px_rgba(44,42,38,0.12)]"
                >
                  {watchlists[market].map((t) => (
                    <SelectItem
                      key={t}
                      value={t}
                      className="cursor-pointer rounded-sm py-2.5 pl-3 pr-8 focus:bg-[#F5F2EB] focus:text-[#2C2A26] data-[highlighted]:bg-[#F5F2EB]"
                    >
                      <ActiveTickerSelectRow symbol={t} market={market} />
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Live Price Display (Focused Ticker) */}
            <div className="bg-[#F5F2EB] border border-[#EBE7DE] rounded-sm p-4 mb-6 min-h-[80px] flex items-center justify-between">
              {market === 'IN' ? (
                // Indian Market (Yahoo REST)
                isFetchingPrice ? (
                  <div className="animate-pulse flex space-x-4 w-full">
                    <div className="h-8 bg-[#EBE7DE] rounded w-1/2"></div>
                  </div>
                ) : activeQuote ? (
                  <>
                    <div className="text-2xl font-mono font-bold text-[#2C2A26]">
                      {activeQuote.price.toFixed(2)}
                    </div>
                    <div className={`flex items-center gap-1 font-mono text-xs font-bold ${
                      (activeQuote.change ?? 0) >= 0 ? 'text-emerald-600' : 'text-red-600'
                    }`}>
                      {(activeQuote.change ?? 0) >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                      {activeQuote.changePercent?.toFixed(2)}%
                    </div>
                  </>
                ) : (
                  <div className="text-[#A8A29E] text-xs font-mono uppercase tracking-widest">
                    Quote Unavailable
                  </div>
                )
              ) : (
                // US: VPS or Finnhub — still "connected" outside regular hours; label as last/snapshot.
                wsPrices[ticker] ? (
                  <div className="w-full flex flex-col gap-2">
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-2xl font-mono font-bold text-[#2C2A26]">
                        ${wsPrices[ticker].price.toFixed(2)}
                      </div>
                      {isNYSERegularSessionOpen() ? (
                        <div
                          className={`shrink-0 text-xs font-mono font-bold px-2 py-1 rounded-sm ${
                            wsPrices[ticker].price > wsPrices[ticker].prev
                              ? 'bg-emerald-100 text-emerald-700'
                              : wsPrices[ticker].price < wsPrices[ticker].prev
                                ? 'bg-red-100 text-red-700'
                                : 'bg-[#EBE7DE] text-[#5D5A53]'
                          }`}
                        >
                          LIVE
                        </div>
                      ) : (
                        <div className="shrink-0 text-xs font-mono font-bold px-2 py-1 rounded-sm bg-[#EBE7DE] text-[#5D5A53]">
                          LAST
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="text-[#A8A29E] text-xs font-mono uppercase tracking-widest flex items-center gap-2">
                     <div className="w-2 h-2 rounded-full bg-[#EBE7DE] animate-ping" />
                     Waiting for price…
                  </div>
                )
              )}
            </div>

            {market !== 'CRYPTO' && (
              <button
                type="button"
                aria-expanded={vpsProfileOpen}
                aria-label={vpsProfileOpen ? 'Hide company fundamentals' : 'Show company fundamentals'}
                onClick={() => {
                  if (vpsProfileOpen) {
                    setVpsProfileOpen(false);
                  } else {
                    void handleLoadVpsProfile(ticker);
                  }
                }}
                disabled={isVpsProfileLoading}
                className="mb-6 flex w-full items-center justify-center gap-2 rounded-sm border border-[#EBE7DE] bg-white py-2 text-[10px] font-bold uppercase tracking-widest text-[#5D5A53] transition hover:border-[#2C2A26] hover:text-[#2C2A26] disabled:opacity-50"
              >
                {isVpsProfileLoading ? (
                  <div className="w-3.5 h-3.5 border-2 border-[#A8A29E] border-t-transparent rounded-full animate-spin" />
                ) : (
                  <ChevronDown
                    className={`h-4 w-4 shrink-0 transition-transform duration-200 ${vpsProfileOpen ? 'rotate-180' : ''}`}
                  />
                )}
                Fundamentals
              </button>
            )}
            
            {/* Yahoo / yfinance profile (Edge → VPS); toggled via chevron above */}
            {market !== 'CRYPTO' && (
              <div className="border-t border-[#EBE7DE] pt-4 mt-2 space-y-3">
                {vpsProfileError && (
                  <div className="rounded-sm border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950">
                    {vpsProfileError}
                  </div>
                )}

                {vpsProfile && vpsProfileOpen && !vpsProfileError && (
                  <div className="rounded-sm border border-[#2C2A26] bg-[#FAF8F3] p-4 space-y-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.6)]">
                    <div className="flex items-start justify-between gap-2 border-b border-[#EBE7DE] pb-3">
                      <div className="flex flex-col gap-1 min-w-0">
                      <p className="text-[10px] uppercase tracking-widest text-[#A8A29E] font-bold">Symbol</p>
                      <p className="font-mono text-lg font-bold text-[#2C2A26]">{String(vpsProfile.symbol ?? ticker)}</p>
                      {typeof vpsProfile.name === 'string' && vpsProfile.name && (
                        <p className="font-serif text-base text-[#433E38] leading-snug">{vpsProfile.name}</p>
                      )}
                      <div className="mt-2 flex flex-wrap gap-2">
                        {typeof vpsProfile.recommendation === 'string' && vpsProfile.recommendation && (
                          <span
                            className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-tight ${
                              vpsProfile.recommendation.includes('buy')
                                ? 'bg-emerald-100 text-emerald-800'
                                : vpsProfile.recommendation.includes('sell')
                                  ? 'bg-red-100 text-red-800'
                                  : 'bg-[#EBE7DE] text-[#5D5A53]'
                            }`}
                          >
                            {vpsProfile.recommendation}
                          </span>
                        )}
                        {typeof vpsProfile.price === 'number' && (
                          <span className="inline-flex items-center rounded-full bg-white px-2.5 py-0.5 text-[10px] font-mono font-bold text-[#2C2A26] border border-[#EBE7DE]">
                            Ref. {market === 'IN' ? '₹' : '$'}
                            {vpsProfile.price.toFixed(2)}
                          </span>
                        )}
                      </div>
                      </div>
                      <button
                        type="button"
                        title="Dismiss"
                        onClick={() => setVpsProfileOpen(false)}
                        className="shrink-0 text-[10px] font-bold uppercase tracking-widest text-[#A8A29E] hover:text-[#2C2A26]"
                      >
                        Close
                      </button>
                    </div>

                    {(typeof vpsProfile.sector === 'string' || typeof vpsProfile.industry === 'string') && (
                      <div className="grid grid-cols-1 gap-1">
                        <p className="text-[9px] uppercase tracking-widest text-[#A8A29E] font-bold">Sector & industry</p>
                        <p className="text-sm font-semibold text-[#2C2A26]">
                          {[vpsProfile.sector, vpsProfile.industry].filter(Boolean).join(' · ')}
                        </p>
                      </div>
                    )}

                    <div className="grid grid-cols-2 gap-2">
                      <div className="rounded-sm bg-white border border-[#EBE7DE] p-2.5">
                        <p className="text-[9px] uppercase tracking-widest text-[#A8A29E] font-bold mb-1">P / E</p>
                        <p className="text-sm font-mono font-bold text-[#2C2A26]">
                          {typeof vpsProfile.pe === 'number' && !Number.isNaN(vpsProfile.pe)
                            ? vpsProfile.pe.toFixed(2)
                            : '—'}
                        </p>
                      </div>
                      <div className="rounded-sm bg-white border border-[#EBE7DE] p-2.5">
                        <p className="text-[9px] uppercase tracking-widest text-[#A8A29E] font-bold mb-1">Market cap</p>
                        <p className="text-sm font-mono font-bold text-[#2C2A26]">
                          {formatCap(typeof vpsProfile.marketCap === 'number' ? vpsProfile.marketCap : undefined)}
                        </p>
                      </div>
                      <div className="rounded-sm bg-white border border-[#EBE7DE] p-2.5">
                        <p className="text-[9px] uppercase tracking-widest text-[#A8A29E] font-bold mb-1">Dividend yield</p>
                        <p className="text-sm font-mono font-bold text-[#2C2A26]">
                          {typeof vpsProfile.dividendYield === 'number'
                            ? formatDividendYield(vpsProfile.dividendYield)
                            : '—'}
                        </p>
                      </div>
                      <div className="rounded-sm bg-white border border-[#EBE7DE] p-2.5">
                        <p className="text-[9px] uppercase tracking-widest text-[#A8A29E] font-bold mb-1">Analyst target</p>
                        <p className="text-sm font-mono font-bold text-emerald-700">
                          {typeof vpsProfile.targetPrice === 'number'
                            ? `${market === 'IN' ? '₹' : '$'}${vpsProfile.targetPrice.toFixed(2)}`
                            : '—'}
                        </p>
                      </div>
                    </div>

                    {typeof vpsProfile.range52w === 'string' && vpsProfile.range52w && (
                      <div className="flex items-center justify-between rounded-sm bg-[#F5F2EB] px-3 py-2 text-[11px]">
                        <span className="uppercase tracking-widest text-[#A8A29E] font-bold">52-week range</span>
                        <span className="font-mono font-semibold text-[#2C2A26]">{vpsProfile.range52w}</span>
                      </div>
                    )}

                    {typeof vpsProfile.summary === 'string' && vpsProfile.summary && (
                      <div>
                        <p className="text-[9px] uppercase tracking-widest text-[#A8A29E] font-bold mb-2">Company profile</p>
                        <p className="text-[13px] leading-relaxed text-[#433E38] font-serif border-l-2 border-[#D6D3C9] pl-3">
                          {vpsProfile.summary}
                        </p>
                      </div>
                    )}

                    <button
                      type="button"
                      onClick={() => void handleLoadVpsProfile(String(vpsProfile.symbol ?? ticker), { skipCache: true })}
                      disabled={isVpsProfileLoading}
                      className="w-full text-center text-[10px] uppercase tracking-widest font-bold text-[#5D5A53] hover:text-[#2C2A26] py-1"
                    >
                      Refresh
                    </button>
                  </div>
                )}
              </div>
            )}

            <button
              onClick={handleRunAnalysis}
              disabled={isRunning || !ticker}
              className={`w-full flex items-center justify-center gap-2 py-4 text-sm uppercase tracking-widest font-medium transition-all ${
                isRunning 
                  ? 'bg-[#EBE7DE] text-[#A8A29E] cursor-not-allowed' 
                  : 'bg-[#2C2A26] hover:bg-[#433E38] text-[#F5F2EB]'
              }`}
            >
              {isRunning ? (
                <>
                  <div className="w-4 h-4 border-2 border-[#A8A29E] border-t-transparent rounded-full animate-spin" />
                  Analyzing
                </>
              ) : (
                <>
                  <Play className="w-4 h-4" /> Run Analysis
                </>
              )}
            </button>
          </div>

          <div className="border border-[#EBE7DE] bg-white p-6">
            <div className="flex items-center gap-4 mb-4 border-b border-[#EBE7DE] pb-2">
              <button
                onClick={() => setActiveTab('watchlist')}
                className={`text-xs uppercase tracking-widest font-bold pb-2 border-b-2 transition-colors ${
                  activeTab === 'watchlist' ? 'border-[#2C2A26] text-[#2C2A26]' : 'border-transparent text-[#A8A29E] hover:text-[#5D5A53]'
                }`}
              >
                Watchlist
              </button>
              <button
                onClick={() => setActiveTab('history')}
                className={`text-xs uppercase tracking-widest font-bold pb-2 border-b-2 transition-colors ${
                  activeTab === 'history' ? 'border-[#2C2A26] text-[#2C2A26]' : 'border-transparent text-[#A8A29E] hover:text-[#5D5A53]'
                }`}
              >
                History
              </button>
              <button
                onClick={() => setActiveTab('scorecard')}
                className={`text-xs uppercase tracking-widest font-bold pb-2 border-b-2 transition-colors ${
                  activeTab === 'scorecard' ? 'border-[#2C2A26] text-[#2C2A26]' : 'border-transparent text-[#A8A29E] hover:text-[#5D5A53]'
                }`}
              >
                Scorecard
              </button>
            </div>

            <div className="space-y-2 h-[400px] overflow-y-auto pr-2 custom-scrollbar">
              {activeTab === 'watchlist' ? (
                watchlists[market].map((t) => {
                  const isActive = ticker === t;
                  const wsData = wsPrices[t];
                  const displayLabel = instrumentPrimaryLabel(t, market);
                  const subLabel = instrumentSecondaryLabel(t, market);
                  const equitySessionOpen =
                    market === 'US'
                      ? isNYSERegularSessionOpen()
                      : market === 'IN'
                        ? isNSESessionOpen()
                        : true;

                  // 24h change for crypto (from Binance open price)
                  const change24h = wsData?.open && wsData.price
                    ? ((wsData.price - wsData.open) / wsData.open) * 100
                    : null;

                  const rowExpanded = !!watchlistExpanded[t];
                  const titleLine =
                    market === 'CRYPTO'
                      ? subLabel || displayLabel
                      : subLabel || t;
                  const tickerLine = market === 'CRYPTO' ? displayLabel : t;
                  
                  return (
                    <div
                      key={t}
                      className={`flex flex-col border transition-all ${
                        isActive ? 'border-[#2C2A26] bg-[#F5F2EB]' : 'border-[#EBE7DE] hover:border-[#A8A29E] bg-white'
                      }`}
                    >
                      <div
                        role="button"
                        tabIndex={0}
                        onClick={() => setTicker(t)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            setTicker(t);
                          }
                        }}
                        className="flex cursor-pointer items-start justify-between gap-2 p-3 outline-none focus-visible:ring-2 focus-visible:ring-[#2C2A26] focus-visible:ring-offset-2"
                      >
                        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                          <span className="truncate text-sm font-semibold leading-tight text-[#2C2A26]" title={titleLine}>
                            {titleLine}
                          </span>
                          <span className="font-mono text-[10px] font-medium tabular-nums text-[#A8A29E]">
                            {tickerLine}
                          </span>
                          {(market === 'US' || market === 'IN') && !equitySessionOpen && (
                            <span className="mt-1 inline-flex w-fit rounded px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wide text-amber-900 bg-amber-100 border border-amber-200/80">
                              Market closed
                            </span>
                          )}
                        </div>

                        {market === 'CRYPTO' && wsData ? (
                          <div className="flex shrink-0 flex-col items-end">
                            <span className="font-mono text-sm font-bold text-[#2C2A26]">
                              ${wsData.price < 0.01 ? wsData.price.toFixed(6) : wsData.price < 1 ? wsData.price.toFixed(4) : wsData.price.toFixed(2)}
                            </span>
                            {change24h !== null && (
                              <span className={`text-[9px] font-bold ${ change24h >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                                {change24h >= 0 ? '+' : ''}{change24h.toFixed(2)}%
                              </span>
                            )}
                          </div>
                        ) : (market === 'US' || market === 'IN') && wsData ? (
                          <div className="flex shrink-0 flex-col items-end">
                            <span
                              className={`font-mono text-sm font-bold transition-colors duration-300 ${
                                wsData.isRest ||
                                (market === 'US' && !isNYSERegularSessionOpen()) ||
                                (market === 'IN' && !isNSESessionOpen())
                                  ? 'text-[#5D5A53]'
                                  : wsData.price > wsData.prev
                                    ? 'text-emerald-600'
                                    : wsData.price < wsData.prev
                                      ? 'text-red-600'
                                      : 'text-[#5D5A53]'
                              }`}
                            >
                              {market === 'IN' ? '₹' : '$'}{wsData.price.toFixed(2)}
                            </span>
                            {(wsData.isRest ||
                              (market === 'US' && !isNYSERegularSessionOpen()) ||
                              (market === 'IN' && !isNSESessionOpen())) && (
                              <span className="text-[8px] uppercase tracking-widest text-[#A8A29E]">Last</span>
                            )}
                          </div>
                        ) : (market === 'US' || market === 'IN') ? (
                          <span className="shrink-0 text-[10px] text-[#A8A29E]">—</span>
                        ) : null}
                      </div>

                      {market !== 'CRYPTO' && (
                        <button
                          type="button"
                          title={rowExpanded ? 'Hide details' : 'Show fundamentals'}
                          aria-expanded={rowExpanded}
                          aria-label={rowExpanded ? `Hide fundamentals for ${t}` : `Show fundamentals for ${t}`}
                          onClick={(e) => toggleWatchlistFundamentals(e, t)}
                          className="flex w-full items-center justify-center border-t border-[#EBE7DE] py-1.5 text-[#A8A29E] transition hover:bg-[#FAF8F3] hover:text-[#2C2A26]"
                        >
                          <ChevronDown
                            className={`h-4 w-4 transition-transform duration-200 ${rowExpanded ? 'rotate-180' : ''}`}
                          />
                        </button>
                      )}

                      {rowExpanded && market !== 'CRYPTO' && (
                        <div
                          className="border-t border-[#EBE7DE] bg-[#FAF8F3] px-3 py-2"
                          onClick={(e) => e.stopPropagation()}
                          onKeyDown={(e) => e.stopPropagation()}
                        >
                          <WatchlistExpandedFundamentals
                            data={watchlistFundamentals[t]}
                            error={watchlistFundErr[t]}
                            loading={!!watchlistFundLoading[t]}
                          />
                        </div>
                      )}
                    </div>
                  );
                })
              ) : activeTab === 'history' ? (
                historySessions.length === 0 ? (
                  <div className="text-[#A8A29E] text-xs text-center pt-8 uppercase tracking-widest">No Past Runs Found</div>
                ) : (
                  historySessions.map((session) => {
                    const isActive = selectedHistorySession?.id === session.id;
                    const sessionName = resolveInstrumentName(session.ticker);
                    return (
                      <div 
                        key={session.id} 
                        onClick={() => handleSelectHistory(session)} 
                        className={`flex flex-col p-3 border cursor-pointer transition-all ${
                        isActive ? 'border-[#2C2A26] bg-[#F5F2EB]' : 'border-[#EBE7DE] hover:border-[#A8A29E] bg-white'
                      }`}>
                        <div className="flex items-center justify-between mb-1 gap-2">
                          <div className="min-w-0">
                            <span className="font-mono text-[#2C2A26] font-semibold text-sm block truncate">{session.ticker}</span>
                            {sessionName && (
                              <span className="text-[9px] text-[#A8A29E] leading-tight line-clamp-2 block">
                                {sessionName}
                              </span>
                            )}
                          </div>
                          <span className="text-[10px] text-[#A8A29E] shrink-0">{new Date(session.created_at).toLocaleDateString()}</span>
                        </div>
                        <span className="text-[10px] uppercase tracking-widest text-[#5D5A53]">{session.status}</span>
                      </div>
                    );
                  })
                )
              ) : (
                <div className="flex flex-col space-y-4">
                  <div className="p-4 border border-[#EBE7DE] bg-white">
                    <h3 className="text-[10px] font-bold uppercase tracking-widest text-[#5D5A53] mb-2">Agent Win/Loss Ratio</h3>
                    <div className="flex items-center justify-between">
                      <div className="flex flex-col items-center">
                        <span className="text-2xl font-bold text-emerald-600">{scorecardStats.wins}</span>
                        <span className="text-[10px] uppercase tracking-widest text-[#A8A29E]">Wins</span>
                      </div>
                      <div className="flex flex-col items-center">
                        <span className="text-2xl font-bold text-red-600">{scorecardStats.losses}</span>
                        <span className="text-[10px] uppercase tracking-widest text-[#A8A29E]">Losses</span>
                      </div>
                      <div className="flex flex-col items-center">
                        <span className="text-2xl font-bold text-[#5D5A53]">{scorecardStats.rate}%</span>
                        <span className="text-[10px] uppercase tracking-widest text-[#A8A29E]">Win Rate</span>
                      </div>
                    </div>
                  </div>
                  <div className="p-4 border border-[#EBE7DE] bg-white">
                    <h3 className="text-[10px] font-bold uppercase tracking-widest text-[#5D5A53] mb-2">Recent Lessons Learned</h3>
                    <ul className="space-y-2">
                       {lessons.length === 0 ? (
                         <li className="text-xs text-[#A8A29E] italic">No post-mortems available yet.</li>
                       ) : (
                         lessons.map(lesson => {
                           const ln = resolveInstrumentName(lesson.ticker);
                           return (
                           <li key={lesson.id} className="text-xs text-[#5D5A53] border-l-2 border-amber-400 pl-2">
                             <span className="font-bold font-mono">{lesson.ticker}</span>
                             {ln && <span className="text-[#A8A29E] font-normal"> — {ln}</span>}
                             <span className="font-normal">: {lesson.lesson}</span>
                           </li>
                           );
                         })
                       )}
                    </ul>
                  </div>
                </div>
              )}
            </div>

            {/* Recon Box */}
            {activeTab === 'watchlist' && (
              <div className="mt-6 border-t border-[#EBE7DE] pt-4">
                <button
                  onClick={handleRunRecon}
                  disabled={isReconning}
                  className={`w-full flex items-center justify-center gap-2 py-3 text-xs uppercase tracking-widest font-bold transition-all border-2 border-[#2C2A26] ${
                    isReconning 
                      ? 'bg-[#EBE7DE] text-[#A8A29E] border-[#A8A29E] cursor-not-allowed' 
                      : 'bg-white text-[#2C2A26] hover:bg-[#F5F2EB]'
                  }`}
                >
                  {isReconning ? (
                    <>
                      <div className="w-3 h-3 border-2 border-[#A8A29E] border-t-transparent rounded-full animate-spin" />
                      Scanning Market...
                    </>
                  ) : (
                    <>
                      <Search className="w-3 h-3" /> Run Daily Recon
                    </>
                  )}
                </button>
                {activeOpportunities.length > 0 && (
                  <div className="mt-4 p-3 bg-emerald-50 border border-emerald-200 rounded-sm">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-emerald-800 mb-2">Recon Targets Found:</p>
                    <div className="flex flex-wrap gap-2">
                      {activeOpportunities.map(opp => (
                        <button
                          key={opp}
                          type="button"
                          title={resolveInstrumentName(opp) ?? opp}
                          onClick={() => setTicker(opp)}
                          className="text-left text-xs font-mono font-bold px-2 py-1 bg-white border border-emerald-300 text-emerald-700 hover:bg-emerald-100 transition-colors max-w-full"
                        >
                          <span className="block truncate">{opp}</span>
                          {resolveInstrumentName(opp) && (
                            <span className="block font-sans font-normal text-[9px] text-emerald-900/80 truncate normal-case">
                              {resolveInstrumentName(opp)}
                            </span>
                          )}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Main Content Area */}
        <div className="col-span-12 lg:col-span-9 space-y-8">
          
          {/* Results Dashboard */}
          {(activeTab === 'history' ? selectedHistorySession?.decision : finalDecision) && (
            <div className="bg-white border-2 border-[#2C2A26] p-8 shadow-[8px_8px_0px_0px_rgba(44,42,38,1)] relative overflow-hidden animate-fade-in-up">
              <div className="absolute top-0 right-0 p-8 opacity-5 pointer-events-none">
                <Activity className="w-64 h-64 text-[#2C2A26]" />
              </div>
              
              <div className="flex items-end justify-between mb-8 relative z-10 border-b-2 border-[#2C2A26] pb-6">
                <div>
                  <p className="text-xs font-bold uppercase tracking-widest text-[#5D5A53] mb-2">
                    {activeTab === 'history' ? 'Historical Decision' : 'Portfolio Manager Decision'}
                  </p>
                  <h2 className="text-5xl font-black text-[#2C2A26] font-serif tracking-tight">
                    {activeTab === 'history' ? selectedHistorySession.ticker : finalDecision.ticker}
                  </h2>
                  {(() => {
                    const decisionTicker = activeTab === 'history' ? selectedHistorySession?.ticker : finalDecision?.ticker;
                    const decisionName = decisionTicker ? resolveInstrumentName(decisionTicker) : undefined;
                    return decisionName ? (
                      <p className="text-sm md:text-base text-[#5D5A53] font-sans font-normal mt-2 max-w-2xl leading-snug">
                        {decisionName}
                      </p>
                    ) : null;
                  })()}
                </div>
                <div className="text-right">
                  <div className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-100 border-2 border-emerald-800 text-emerald-900 font-bold tracking-widest text-sm uppercase">
                    {activeTab === 'history' ? selectedHistorySession.decision : finalDecision.decision}
                  </div>
                  <p className="text-[#5D5A53] font-mono text-xs mt-3 uppercase tracking-wider">
                    Confidence: <span className="font-bold text-[#2C2A26]">{activeTab === 'history' ? 'Historical' : finalDecision.confidence}</span>
                  </p>
                </div>
              </div>

              <div className="relative z-10">
                <h3 className="text-xs uppercase tracking-widest text-[#5D5A53] font-bold mb-4">Executive Thesis</h3>
                <p className="text-[#2C2A26] leading-relaxed text-lg font-serif">
                  {activeTab === 'history' ? selectedHistorySession.thesis : finalDecision.thesis}
                </p>
              </div>
            </div>
          )}

          {/* Execution Terminal */}
          <div className="bg-white border border-[#EBE7DE] flex flex-col h-[600px]">
            <div className="bg-[#F5F2EB] px-6 py-4 border-b border-[#EBE7DE] flex items-center justify-between">
              <div className="flex min-w-0 flex-col gap-1">
                <div className="flex items-center gap-2 text-[#5D5A53] text-xs uppercase tracking-widest font-bold">
                  <Terminal className="w-4 h-4 shrink-0" />{' '}
                  {activeTab === 'history' ? 'Historical Logs' : 'Execution Log'}
                </div>
                {(activeTab === 'history' ? selectedHistorySession?.id : sessionId) && (
                  <p
                    className="truncate font-mono text-[10px] font-normal normal-case tracking-normal text-[#A8A29E]"
                    title={String(activeTab === 'history' ? selectedHistorySession?.id : sessionId)}
                  >
                    Research ID: {activeTab === 'history' ? selectedHistorySession?.id : sessionId}
                  </p>
                )}
              </div>
              {isRunning && activeTab === 'watchlist' && (
                <div className="flex items-center gap-2 text-[#2C2A26] text-[10px] uppercase tracking-widest font-bold animate-pulse">
                  <span className="w-2 h-2 bg-[#2C2A26]" /> Processing
                </div>
              )}
            </div>
            
            <div className="p-6 font-mono text-sm overflow-y-auto flex-1 space-y-4 bg-white">
              {((activeTab === 'history' ? historyLogs : logs).length === 0) && (!isRunning || activeTab === 'history') && (
                <div className="h-full flex flex-col items-center justify-center text-[#A8A29E] italic font-serif">
                  <Activity className="w-8 h-8 mb-4 opacity-50" />
                  {activeTab === 'history' ? 'Select a past run to view logs.' : 'Awaiting execution trigger.'}
                </div>
              )}
              {(activeTab === 'history' ? historyLogs : logs).map((log) => (
                <div key={log.id} className="flex gap-6 animate-in fade-in slide-in-from-bottom-2 duration-300 border-l-2 border-[#EBE7DE] pl-4">
                  <span className="text-[#A8A29E] shrink-0 w-24">{log.time}</span>
                  <div className="flex-1">
                    <span className="text-[#2C2A26] font-bold uppercase text-[10px] tracking-widest block mb-1">{log.agent}</span>
                    <span className="text-[#5D5A53]">{log.message}</span>
                  </div>
                </div>
              ))}
              {isRunning && activeTab === 'watchlist' && (
                <div className="flex gap-6 animate-pulse border-l-2 border-[#EBE7DE] pl-4">
                  <span className="text-[#A8A29E] shrink-0 w-24">{new Date().toLocaleTimeString()}</span>
                  <div className="w-3 h-4 bg-[#EBE7DE]" />
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
