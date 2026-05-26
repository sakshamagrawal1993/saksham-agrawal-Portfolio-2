import { supabase } from '../../lib/supabaseClient';
import type { UserMode } from './types';

export const FNO_COPILOT_FUNCTION = 'fno-copilot-proxy';

export type FnOCopilotEdgeAction =
  | 'bootstrap'
  | 'market_overview'
  | 'top5_trades'
  | 'chat_message'
  | 'ai_ask'
  | 'ai_create_trade'
  | 'ai_create_algo_strategy'
  | 'ai_create_screener'
  | 'option_screener_query'
  | 'finalize_trade'
  | 'finalize_algo_strategy'
  | 'backtest'
  | 'paper_trade_create';

export type FnOCopilotEnvelope<T> = {
  ok: boolean;
  action: string;
  requestId: string;
  data?: T;
  error?: { code: string; message: string };
};

export type FnOCopilotBootstrapData = {
  mode?: string;
  overview?: Record<string, unknown>;
};

export type FnOCopilotChatData = {
  assistant_message?: string;
  state?: string;
  missing_inputs?: string[];
  artifact?: { type?: string; title?: string; status?: string };
};

const env = (import.meta as ImportMeta & { env: Record<string, string | undefined> }).env;

export const isFnOCopilotEdgeEnabled = () => {
  const flag = env.VITE_FNO_COPILOT_USE_EDGE;
  if (flag === 'false' || flag === '0') return false;
  if (flag === 'true' || flag === '1') {
    return Boolean(env.VITE_SUPABASE_URL && env.VITE_SUPABASE_ANON_KEY);
  }
  return Boolean(env.VITE_SUPABASE_URL && env.VITE_SUPABASE_ANON_KEY);
};

export const userModeToEdgeAction = (mode: UserMode): FnOCopilotEdgeAction => {
  switch (mode) {
    case 'ask-ai':
      return 'ai_ask';
    case 'create-strategy':
      return 'ai_create_algo_strategy';
    case 'screener':
      return 'ai_create_screener';
    case 'create-trade':
    default:
      return 'ai_create_trade';
  }
};

export const invokeFnOCopilot = async <T,>(
  body: Record<string, unknown> & { action: FnOCopilotEdgeAction },
): Promise<T> => {
  const { data, error } = await supabase.functions.invoke(FNO_COPILOT_FUNCTION, { body });
  if (error) {
    throw error;
  }

  const envelope = data as FnOCopilotEnvelope<T>;
  if (!envelope?.ok) {
    throw new Error(envelope?.error?.message || 'FnO Co-Pilot request failed');
  }

  return envelope.data as T;
};

export const fetchFnOCopilotBootstrap = () =>
  invokeFnOCopilot<FnOCopilotBootstrapData>({ action: 'bootstrap' });

export const fetchFnOCopilotChatReply = (params: {
  mode: UserMode;
  message: string;
  instrument?: string;
  expiry?: string;
}) =>
  invokeFnOCopilot<FnOCopilotChatData>({
    action: userModeToEdgeAction(params.mode),
    message: params.message,
    instrument: params.instrument,
    expiry: params.expiry,
  });
