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
  dataSource?: string;
  marketStatus?: string;
  expiry?: string;
  instrument?: Record<string, unknown>;
  optionChain?: Array<Record<string, unknown>>;
  overview?: Record<string, unknown>;
  marketInformation?: Record<string, unknown>;
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

export const fetchFnOCopilotBootstrap = (params?: { instrument?: string; expiry?: string }) =>
  invokeFnOCopilot<FnOCopilotBootstrapData>({
    action: 'bootstrap',
    ...(params?.instrument ? { instrument: params.instrument } : {}),
    ...(params?.expiry ? { expiry: params.expiry } : {}),
  });

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

export type AgentChatData = {
  assistant_reply: string;
  artifact_payload: Record<string, unknown>;
  artifact_status: string;
  artifact_instruction?: {
    operation?: 'merge' | 'replace' | 'json_patch';
    status?: string;
    missing_inputs?: string[];
    updated_artifact_payload?: Record<string, unknown>;
    validation_flags?: Array<Record<string, unknown>>;
  };
};

export type FnOWorkflowType =
  | 'ask_ai'
  | 'create_trade'
  | 'create_algo_strategy'
  | 'option_screener';

export type AgentSessionInitData = {
  session_id: string;
  workflow_type: FnOWorkflowType;
  artifact_id: string;
  artifact_type: 'answer' | 'trade' | 'algo_strategy' | 'screener';
  artifact_payload: Record<string, unknown>;
  artifact_status: string;
};

const userModeToWorkflowType = (mode: UserMode): FnOWorkflowType => {
  switch (mode) {
    case 'ask-ai':
      return 'ask_ai';
    case 'create-strategy':
      return 'create_algo_strategy';
    case 'screener':
      return 'option_screener';
    case 'create-trade':
    default:
      return 'create_trade';
  }
};

export const initAgentSession = async (params: {
  mode: UserMode;
  user_id?: string;
  symbol?: string;
  screen_context?: string;
}): Promise<AgentSessionInitData> => {
  const body = {
    workflow_type: userModeToWorkflowType(params.mode),
    user_id: params.user_id,
    symbol: params.symbol,
    screen_context: params.screen_context,
  };
  const { data, error } = await supabase.functions.invoke('fno-copilot-session-init', { body });
  if (error) {
    throw error;
  }
  if (!data?.ok) {
    throw new Error(data?.error || 'Agent session init failed');
  }
  return data as AgentSessionInitData;
};

export const sendAgentChat = async (params: {
  session_id: string;
  message: string;
  mode?: UserMode;
  user_id?: string;
}): Promise<AgentChatData> => {
  const body = {
    session_id: params.session_id,
    message: params.message,
    workflow_type: params.mode ? userModeToWorkflowType(params.mode) : undefined,
    user_id: params.user_id,
  };
  const { data, error } = await supabase.functions.invoke('fno-copilot-chat', { body });
  if (error) {
    throw error;
  }
  if (!data?.ok) {
    throw new Error(data?.error || 'Agent chat request failed');
  }
  return data as AgentChatData;
};

