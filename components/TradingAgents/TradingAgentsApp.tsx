import React, { useState, useEffect, useRef } from 'react';
import { ArrowLeft, Play, TrendingUp, TrendingDown, Activity, Search, LayoutDashboard, Terminal, Zap } from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';

interface TradingAgentsAppProps {
  onBack: () => void;
}

const TOP_50_US = [
  'AAPL', 'MSFT', 'NVDA', 'GOOGL', 'AMZN', 'META', 'LLY', 'TSLA', 'AVGO', 'JPM', 
  'V', 'WMT', 'UNH', 'MA', 'PG', 'JNJ', 'XOM', 'HD', 'MRK', 'COST', 
  'ABBV', 'CVX', 'CRM', 'AMD', 'PEP', 'BAC', 'NFLX', 'LIN', 'KO', 'TMO', 
  'WFC', 'ADBE', 'DIS', 'INTC', 'CSCO', 'ABNB', 'MCD', 'ABT', 'INTU', 'QCOM', 
  'DHR', 'IBM', 'CAT', 'GE', 'VZ', 'TXN', 'NOW', 'AMAT', 'PFE', 'ISRG'
];

const TOP_50_IN = [
  'RELIANCE.NS', 'TCS.NS', 'HDFCBANK.NS', 'ICICIBANK.NS', 'INFY.NS', 'ITC.NS', 'SBIN.NS', 'BHARTIARTL.NS', 'L&T.NS', 'BAJFINANCE.NS',
  'HINDUNILVR.NS', 'AXISBANK.NS', 'KOTAKBANK.NS', 'ASIANPAINT.NS', 'MARUTI.NS', 'SUNPHARMA.NS', 'TITAN.NS', 'TATASTEEL.NS', 'NTPC.NS', 'M&M.NS',
  'ULTRACEMCO.NS', 'POWERGRID.NS', 'TATAMOTORS.NS', 'ONGC.NS', 'NESTLEIND.NS', 'JSWSTEEL.NS', 'GRASIM.NS', 'TECHM.NS', 'ADANIENT.NS', 'HINDALCO.NS',
  'WIPRO.NS', 'BAJAJFINSV.NS', 'COALINDIA.NS', 'HDFCLIFE.NS', 'INDUSINDBK.NS', 'EICHERMOT.NS', 'APOLLOHOSP.NS', 'DIVISLAB.NS', 'BRITANNIA.NS', 'DRREDDY.NS',
  'BAJAJ-AUTO.NS', 'HEROMOTOCO.NS', 'CIPLA.NS', 'SBILIFE.NS', 'LTIM.NS', 'TATACONSUM.NS', 'UPL.NS', 'BPCL.NS', 'ADANIPORTS.NS', 'TATAPOWER.NS'
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
  const [deepResearchData, setDeepResearchData] = useState<any>(null);
  const [isResearching, setIsResearching] = useState(false);

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
  const [wsStatus, setWsStatus] = useState<'disconnected' | 'connecting' | 'connected'>('disconnected');
  const [yhWsStatus, setYhWsStatus] = useState<'disconnected' | 'connecting' | 'connected'>('disconnected');

  const watchlists: Record<string, string[]> = {
    US: TOP_50_US,
    IN: TOP_50_IN,
    CRYPTO: TOP_20_CRYPTO.map(c => c.symbol),
  };


  useEffect(() => {
    // Reset ticker when switching markets
    setTicker(watchlists[market][0]);
  }, [market]);

  useEffect(() => {
    if (!ticker) return;

    const fetchDeepData = async () => {
      setIsResearching(true);
      try {
        const response = await fetch('https://ralhkmpbslsdkwnqzqen.supabase.co/functions/v1/trading-agents-proxy', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'deep_research', ticker })
        });
        if (response.ok) {
          const data = await response.json();
          setDeepResearchData(data);
        }
      } catch (e) {
        console.error("Deep research fetch failed", e);
      } finally {
        setIsResearching(false);
      }
    };

    fetchDeepData();
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
       const formattedLogs = data.map(log => ({
         id: log.id,
         agent: log.agent_name,
         message: log.action_log,
         time: new Date(log.created_at).toLocaleTimeString()
       }));
       setHistoryLogs(formattedLogs);
       
       const finalLog = data.find(l => l.agent_name === 'Portfolio Manager' && l.action_log.includes('decision'));
       if (finalLog) {
         try {
           const decisionData = JSON.parse(finalLog.action_log);
           setSelectedHistorySession((prev: any) => ({
             ...prev,
             decision: decisionData.decision || 'HOLD',
             thesis: decisionData.thesis || finalLog.action_log,
             confidence: decisionData.confidence || 'Medium'
           }));
         } catch (e) {
           // Fallback if parsing fails
           setSelectedHistorySession((prev: any) => ({
             ...prev,
             decision: 'HOLD',
             thesis: finalLog.action_log
           }));
         }
       }
    }
  };

  // Helper: is US market currently open?
  const isMarketOpen = () => {
    const now = new Date();
    const estOffset = -5 * 60; // EST = UTC-5 (simplified; doesn't account for DST)
    const utcMins = now.getUTCHours() * 60 + now.getUTCMinutes();
    const estMins = (utcMins + estOffset + 1440) % 1440;
    const day = now.getUTCDay();
    // Mon-Fri, 9:30am-4:00pm EST
    return day >= 1 && day <= 5 && estMins >= 570 && estMins < 960;
  };

  // Fetch REST fallback prices from proxy (which calls FMP/Polygon server-side)
  const fetchRestPrices = async (tickers: string[]) => {
    try {
      const symbols = tickers.join(',');
      const res = await fetch('https://ralhkmpbslsdkwnqzqen.supabase.co/functions/v1/trading-agents-proxy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'batch_quote', symbols })
      });
      if (!res.ok) return;
      const data = await res.json();
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

  // Sync WS Ref to State every 500ms (US Finnhub WS + Crypto Binance WS)
  useEffect(() => {
    const interval = setInterval(() => {
      setWsPrices({...livePricesRef.current});
    }, 500);
    return () => clearInterval(interval);
  }, []);

  // --- VPS WebSocket Bridge (Primary for US + IN) ---
  useEffect(() => {
    if (market === 'CRYPTO') {
      setYhWsStatus('disconnected');
      return;
    }

    setYhWsStatus('connecting');
    const vpsWsUrl = `ws://72.61.231.160:8001/ws`;
    let socket: WebSocket;

    try {
      socket = new WebSocket(vpsWsUrl);

      socket.onopen = () => {
        setYhWsStatus('connected');
        // Subscribe to current market watchlist
        const tickers = market === 'US' ? TOP_50_US : TOP_50_IN;
        socket.send(JSON.stringify({ tickers }));
      };

      socket.onmessage = (event) => {
        const msg = JSON.parse(event.data);
        if (msg.type === 'update') {
          const updates = msg.data;
          const newPrices = { ...livePricesRef.current };
          Object.entries(updates).forEach(([sym, update]: [string, any]) => {
            newPrices[sym] = {
              price: update.price,
              prev: livePricesRef.current[sym]?.price || update.price,
              time: update.time,
              isRest: false
            };
          });
          livePricesRef.current = newPrices;
        }
      };

      socket.onclose = () => setYhWsStatus('disconnected');
      socket.onerror = () => setYhWsStatus('disconnected');

      return () => socket.close();
    } catch (e) {
      console.error("Failed to connect to VPS WS", e);
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
      tickers = TOP_50_IN.slice(0, 25);
    }
    
    if (tickers.length === 0) return;
    
    // Clear old prices from different market
    livePricesRef.current = {};
    setWsPrices({});
    
    fetchRestPrices(tickers);
    const interval = setInterval(() => fetchRestPrices(tickers), 5 * 60 * 1000); // Refresh every 5 min
    return () => clearInterval(interval);
  }, [market, yhWsStatus, wsStatus]);

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
        const res = await fetch('https://ralhkmpbslsdkwnqzqen.supabase.co/functions/v1/trading-agents-proxy', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'get_finnhub_token' })
        });
        const data = await res.json();
        
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
  }, [market]);

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
        const response = await fetch('https://ralhkmpbslsdkwnqzqen.supabase.co/functions/v1/trading-agents-proxy', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'quote', ticker })
        });
        
        if (response.ok) {
          const data = await response.json();
          setActiveQuote(data);
        } else {
          setActiveQuote(null);
        }
      } catch (err) {
        setActiveQuote(null);
      } finally {
        setIsFetchingPrice(false);
      }
    };

    const delayDebounceFn = setTimeout(() => { fetchQuote(); }, 500);
    return () => clearTimeout(delayDebounceFn);
  }, [ticker, market]);

  // Supabase Realtime Subscription for Live Execution Logs
  useEffect(() => {
    if (!sessionId) return;

    const channel = supabase.channel(`logs-${sessionId}`)
      .on('postgres_changes', { 
        event: 'INSERT', 
        schema: 'public', 
        table: 'trading_logs',
        filter: `session_id=eq.${sessionId}`
      }, (payload) => {
        const newLog = payload.new;
        setLogs(prev => [...prev, {
          id: newLog.id,
          agent: newLog.agent_name,
          message: newLog.action_log,
          time: new Date(newLog.created_at).toLocaleTimeString()
        }]);

        // If Portfolio Manager makes a decision, stop the run and show it
        if (newLog.agent_name === 'Portfolio Manager' && newLog.action_log.includes('decision')) {
           setIsRunning(false);
           try {
             const decisionData = JSON.parse(newLog.action_log);
             setFinalDecision({
                ticker,
                decision: decisionData.decision || 'HOLD',
                confidence: decisionData.confidence || 'Medium',
                thesis: decisionData.thesis || newLog.action_log
             });
           } catch (e) {
             setFinalDecision({
                ticker,
                decision: 'HOLD',
                confidence: 'Medium',
                thesis: newLog.action_log
             });
           }
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [sessionId, ticker]);

  const handleRunAnalysis = async () => {
    setIsRunning(true);
    setActiveTab('watchlist');
    setLogs([]);
    setFinalDecision(null);
    
    const newSessionId = crypto.randomUUID();
    setSessionId(newSessionId);
    
    setLogs(prev => [...prev, {
      id: Date.now().toString(),
      agent: 'System',
      message: `Triggering secure Edge Function for ${ticker}...`,
      time: new Date().toLocaleTimeString()
    }]);

    try {
      const currentPrice = wsPrices[ticker]?.price || activeQuote?.price || 0;
      
      await supabase.from('trading_sessions').insert({
        id: newSessionId,
        ticker: ticker,
        status: 'running',
        execution_price: currentPrice
      });

      const response = await fetch('https://ralhkmpbslsdkwnqzqen.supabase.co/functions/v1/trading-agents-proxy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'run', ticker, session_id: newSessionId })
      });
      
      if (!response.ok) {
        throw new Error(`Failed to trigger analysis. Status: ${response.status}`);
      }

    } catch (error: any) {
      console.error(error);
      setLogs(prev => [...prev, {
        id: Date.now().toString(),
        agent: 'System',
        message: `Error: ${error.message}`,
        time: new Date().toLocaleTimeString()
      }]);
      setIsRunning(false);
    }
  };

  const handleRunRecon = async () => {
    setIsReconning(true);
    setActiveOpportunities([]);
    try {
      // Pass the entire watchlist to the recon screener
      const response = await fetch('https://ralhkmpbslsdkwnqzqen.supabase.co/functions/v1/trading-agents-proxy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'recon', tickers: watchlists[market].slice(0, 15).join(',') })
      });
      if (response.ok) {
         const data = await response.json();
         // Parse the recommended tickers
         if (data.opportunities) {
            setActiveOpportunities(data.opportunities);
         }
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
          {market === 'US' && (
             <div className={`flex items-center gap-2 text-xs font-bold uppercase tracking-widest ${wsStatus === 'connected' ? 'text-emerald-600' : 'text-[#A8A29E]'}`}>
               <Zap className="w-3 h-3" />
               {wsStatus === 'connected' ? 'Live WS Connected' : 'Connecting...'}
             </div>
          )}
          {market === 'IN' && (
             <div className={`flex items-center gap-2 text-xs font-bold uppercase tracking-widest ${yhWsStatus === 'connected' ? 'text-[#F59E0B]' : 'text-[#A8A29E]'}`}>
               <Activity className="w-3 h-3" />
               {yhWsStatus === 'connected' ? 'VPS Stream Live' : 'Connecting...'}
             </div>
          )}
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
            <h2 className="text-xs uppercase tracking-widest text-[#2C2A26] font-bold mb-4 flex items-center gap-2">
              <Search className="w-4 h-4" /> Active Ticker
            </h2>
            <div className="relative mb-4">
              <select
                value={ticker}
                onChange={(e) => setTicker(e.target.value)}
                className="w-full bg-[#F5F2EB] border border-[#EBE7DE] rounded-sm px-4 py-3 text-[#2C2A26] font-mono text-xl focus:outline-none focus:border-[#2C2A26] transition-colors uppercase appearance-none cursor-pointer"
              >
                {watchlists[market].map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
              <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-4 text-[#5D5A53]">
                <svg className="fill-current h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"><path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z"/></svg>
              </div>
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
                // US Market (Finnhub WS)
                wsPrices[ticker] ? (
                  <div className="w-full flex items-center justify-between">
                    <div className="text-2xl font-mono font-bold text-[#2C2A26]">
                      ${wsPrices[ticker].price.toFixed(2)}
                    </div>
                    {/* Flashing indicator based on tick direction */}
                    <div className={`text-xs font-mono font-bold px-2 py-1 rounded-sm ${
                      wsPrices[ticker].price > wsPrices[ticker].prev 
                        ? 'bg-emerald-100 text-emerald-700' 
                        : wsPrices[ticker].price < wsPrices[ticker].prev 
                        ? 'bg-red-100 text-red-700' 
                        : 'bg-[#EBE7DE] text-[#5D5A53]'
                    }`}>
                       LIVE
                    </div>
                  </div>
                ) : (
                  <div className="text-[#A8A29E] text-xs font-mono uppercase tracking-widest flex items-center gap-2">
                     <div className="w-2 h-2 rounded-full bg-[#EBE7DE] animate-ping" />
                     Waiting for trade...
                  </div>
                )
              )}
            </div>
            
            {/* Deep Research Data */}
            {deepResearchData && !deepResearchData.error && (
              <div className="border-t border-[#EBE7DE] pt-4 mt-2 space-y-3">
                <div className="flex items-center justify-between">
                   <h3 className="text-[10px] uppercase tracking-widest text-[#2C2A26] font-bold">Market Intelligence</h3>
                   <div className={`px-2 py-0.5 rounded-full text-[8px] font-bold uppercase tracking-tighter ${
                     deepResearchData.recommendation?.includes('buy') ? 'bg-emerald-100 text-emerald-700' : 
                     deepResearchData.recommendation?.includes('sell') ? 'bg-red-100 text-red-700' : 'bg-[#EBE7DE] text-[#5D5A53]'
                   }`}>
                     {deepResearchData.recommendation || 'Neutral'}
                   </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div className="bg-[#F5F2EB] p-2 rounded-sm col-span-2">
                    <p className="text-[8px] uppercase tracking-widest text-[#A8A29E] font-bold">Sector / Industry</p>
                    <p className="text-[10px] font-bold text-[#2C2A26] truncate">{deepResearchData.sector} • {deepResearchData.industry}</p>
                  </div>
                  <div className="bg-[#F5F2EB] p-2 rounded-sm">
                    <p className="text-[8px] uppercase tracking-widest text-[#A8A29E] font-bold">P/E Ratio</p>
                    <p className="text-xs font-mono font-bold text-[#2C2A26]">{deepResearchData.pe?.toFixed(2) || '—'}</p>
                  </div>
                  <div className="bg-[#F5F2EB] p-2 rounded-sm">
                    <p className="text-[8px] uppercase tracking-widest text-[#A8A29E] font-bold">Market Cap</p>
                    <p className="text-xs font-mono font-bold text-[#2C2A26]">
                      {deepResearchData.marketCap > 1e12 
                        ? (deepResearchData.marketCap / 1e12).toFixed(2) + 'T' 
                        : (deepResearchData.marketCap / 1e9).toFixed(2) + 'B'}
                    </p>
                  </div>
                  <div className="bg-[#F5F2EB] p-2 rounded-sm">
                    <p className="text-[8px] uppercase tracking-widest text-[#A8A29E] font-bold">Dividend</p>
                    <p className="text-xs font-mono font-bold text-[#2C2A26]">{deepResearchData.dividendYield ? (deepResearchData.dividendYield * 100).toFixed(2) + '%' : '0.00%'}</p>
                  </div>
                  <div className="bg-[#F5F2EB] p-2 rounded-sm">
                    <p className="text-[8px] uppercase tracking-widest text-[#A8A29E] font-bold">Analyst Target</p>
                    <p className="text-xs font-mono font-bold text-emerald-600">${deepResearchData.analystTarget?.toFixed(2) || '—'}</p>
                  </div>
                </div>

                {deepResearchData.summary && (
                  <div className="bg-[#F5F2EB] p-3 rounded-sm">
                    <p className="text-[8px] uppercase tracking-widest text-[#A8A29E] font-bold mb-1">Company Profile</p>
                    <p className="text-[10px] text-[#5D5A53] leading-relaxed line-clamp-3 hover:line-clamp-none transition-all cursor-help border-b border-[#EBE7DE] pb-2 mb-2">
                      {deepResearchData.summary}
                    </p>
                    <div className="flex items-center justify-between text-[8px] uppercase tracking-widest font-bold text-[#A8A29E]">
                      <span>Range (52W)</span>
                      <span className="text-[#2C2A26]">{deepResearchData.range52w}</span>
                    </div>
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

            <div className="space-y-2 h-[320px] overflow-y-auto pr-2 custom-scrollbar">
              {activeTab === 'watchlist' ? (
                watchlists[market].map((t) => {
                  const isActive = ticker === t;
                  const wsData = wsPrices[t];
                  
                  // For crypto, look up display name
                  const cryptoMeta = market === 'CRYPTO' ? TOP_20_CRYPTO.find(c => c.symbol === t) : null;
                  const displayLabel = cryptoMeta ? cryptoMeta.display : t;
                  const subLabel = cryptoMeta ? cryptoMeta.name : null;

                  // 24h change for crypto (from Binance open price)
                  const change24h = wsData?.open && wsData.price
                    ? ((wsData.price - wsData.open) / wsData.open) * 100
                    : null;
                  
                  return (
                    <div 
                      key={t} 
                      onClick={() => setTicker(t)} 
                      className={`flex items-center justify-between p-3 border cursor-pointer transition-all ${
                      isActive ? 'border-[#2C2A26] bg-[#F5F2EB]' : 'border-[#EBE7DE] hover:border-[#A8A29E] bg-white'
                    }`}>
                      <div className="flex flex-col">
                        <span className="font-mono text-[#2C2A26] font-semibold text-sm">{displayLabel}</span>
                        {subLabel && <span className="text-[9px] text-[#A8A29E] uppercase tracking-widest">{subLabel}</span>}
                      </div>
                      
                      {market === 'CRYPTO' && wsData ? (
                        <div className="flex flex-col items-end">
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
                        <div className="flex flex-col items-end">
                          <span className={`font-mono text-sm font-bold transition-colors duration-300 ${
                            wsData.isRest
                              ? 'text-[#5D5A53]'
                              : wsData.price > wsData.prev
                                ? 'text-emerald-600'
                                : wsData.price < wsData.prev
                                  ? 'text-red-600'
                                  : 'text-[#5D5A53]'
                          }`}>
                            {market === 'IN' ? '₹' : '$'}{wsData.price.toFixed(2)}
                          </span>
                          {wsData.isRest && (
                            <span className="text-[8px] uppercase tracking-widest text-[#A8A29E]">Market Closed</span>
                          )}
                        </div>
                      ) : (market === 'US' || market === 'IN') ? (
                        <span className="text-[10px] text-[#A8A29E]">—</span>
                      ) : null}
                    </div>
                  );
                })
              ) : activeTab === 'history' ? (
                historySessions.length === 0 ? (
                  <div className="text-[#A8A29E] text-xs text-center pt-8 uppercase tracking-widest">No Past Runs Found</div>
                ) : (
                  historySessions.map((session) => {
                    const isActive = selectedHistorySession?.id === session.id;
                    return (
                      <div 
                        key={session.id} 
                        onClick={() => handleSelectHistory(session)} 
                        className={`flex flex-col p-3 border cursor-pointer transition-all ${
                        isActive ? 'border-[#2C2A26] bg-[#F5F2EB]' : 'border-[#EBE7DE] hover:border-[#A8A29E] bg-white'
                      }`}>
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-mono text-[#2C2A26] font-semibold">{session.ticker}</span>
                          <span className="text-[10px] text-[#A8A29E]">{new Date(session.created_at).toLocaleDateString()}</span>
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
                         lessons.map(lesson => (
                           <li key={lesson.id} className="text-xs text-[#5D5A53] border-l-2 border-amber-400 pl-2">
                             <span className="font-bold">{lesson.ticker}:</span> {lesson.lesson}
                           </li>
                         ))
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
                          onClick={() => setTicker(opp)}
                          className="text-xs font-mono font-bold px-2 py-1 bg-white border border-emerald-300 text-emerald-700 hover:bg-emerald-100 transition-colors"
                        >
                          {opp}
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
                  <h2 className="text-5xl font-black text-[#2C2A26] font-serif">
                    {activeTab === 'history' ? selectedHistorySession.ticker : finalDecision.ticker}
                  </h2>
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
              <div className="flex items-center gap-2 text-[#5D5A53] text-xs uppercase tracking-widest font-bold">
                <Terminal className="w-4 h-4" /> {activeTab === 'history' ? 'Historical Logs' : 'Execution Log'}
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
