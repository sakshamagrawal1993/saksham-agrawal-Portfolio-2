import { supabase } from '../../lib/supabaseClient';

export type AgentLog = {
  id: string;
  agent_role: string;
  log_type: string;
  content: string;
  created_at: string;
};

export type PortfolioDecision = {
  decision?: 'BUY' | 'SELL' | 'HOLD';
  confidence?: 'High' | 'Medium' | 'Low';
  thesis?: string;
};

export type TradingAgentsAction =
  | { action: 'deep_research'; ticker: string }
  | { action: 'vps_yfinance_research'; ticker: string }
  | { action: 'batch_quote'; symbols: string }
  | { action: 'get_finnhub_token' }
  | { action: 'quote'; ticker: string }
  | { action: 'run'; ticker: string; session_id: string; execution_price: number }
  | { action: 'recon'; tickers: string };

export const TRADING_AGENTS_FUNCTION = 'trading-agents-proxy';

/** Override with VITE_TRADING_AGENTS_VPS_WS_URL. On HTTPS pages, ws:// may be blocked; use wss:// or a same-origin proxy. */
export const TRADING_AGENTS_VPS_WS_URL =
  (import.meta as any).env.VITE_TRADING_AGENTS_VPS_WS_URL ||
  'ws://72.61.231.160:8001/ws';

export const invokeTradingAgents = async <T,>(body: TradingAgentsAction): Promise<T> => {
  const { data, error } = await supabase.functions.invoke(TRADING_AGENTS_FUNCTION, { body });
  if (error) {
    throw error;
  }
  return data as T;
};

export const formatAgentLog = (log: AgentLog) => ({
  id: log.id,
  agent: log.agent_role,
  message: log.content,
  time: new Date(log.created_at).toLocaleTimeString()
});

export const parsePortfolioDecision = (content: string): PortfolioDecision | null => {
  try {
    return JSON.parse(content);
  } catch {
    const match = content.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]);
    } catch {
      return null;
    }
  }
};
