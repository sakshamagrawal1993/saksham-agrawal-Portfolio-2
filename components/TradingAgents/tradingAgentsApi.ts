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

/**
 * VPS WebSocket for live quotes. Browsers forbid ws:// from https:// pages (mixed content).
 * Production: set VITE_TRADING_AGENTS_VPS_WS_URL=wss://<your-traefik-host>/ws
 * Dev over http://localhost: default falls back to raw VPS ws:// (or set the env to match).
 */
function resolveTradingAgentsVpsWsUrl(): string {
  const envUrl = (import.meta as any).env?.VITE_TRADING_AGENTS_VPS_WS_URL as string | undefined;
  if (envUrl?.trim()) return envUrl.trim();

  if (typeof window !== 'undefined' && window.location.protocol === 'https:') {
    console.error(
      '[TradingAgents] HTTPS requires a secure WebSocket. Set VITE_TRADING_AGENTS_VPS_WS_URL to wss://…/ws (TLS via Traefik or similar). ws:// to an IP is blocked by the browser.',
    );
    return '';
  }

  return 'ws://72.61.231.160:8001/ws';
}

export const TRADING_AGENTS_VPS_WS_URL = resolveTradingAgentsVpsWsUrl();

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
