import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-trading-agents-admin-token',
}

const TRADING_AGENTS_WEBHOOK_SECRET =
  Deno.env.get('TRADING_AGENTS_N8N_WEBHOOK_SECRET') ||
  Deno.env.get('N8N_WEBHOOK_SECRET');

type AgentLogInput = {
  agent_role?: string;
  agent?: string;
  log_type?: string;
  content?: string;
  message?: string;
};

type PortfolioDecision = {
  decision?: string;
  confidence?: string;
  thesis?: string;
  risk_flags?: string[];
  signal_tags?: string[];
  evaluation_horizon?: string;
};

const jsonResponse = (payload: unknown, status = 200) =>
  new Response(JSON.stringify(payload), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    status,
  });

const getErrorMessage = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

const getServiceClient = () => {
  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Missing Supabase service role configuration');
  }
  return createClient(supabaseUrl, supabaseKey);
};

const requireAdminToken = (req: Request) => {
  const adminToken = Deno.env.get('TRADING_AGENTS_ADMIN_TOKEN');
  if (!adminToken) {
    throw new Error('TRADING_AGENTS_ADMIN_TOKEN is required for this action');
  }

  const providedToken = req.headers.get('x-trading-agents-admin-token');
  if (providedToken !== adminToken) {
    return jsonResponse({ error: 'Forbidden' }, 403);
  }

  return null;
};

const normalizeAgentLog = (log: AgentLogInput) => ({
  agent_role: log.agent_role || log.agent || 'System',
  log_type: log.log_type || 'research',
  content: log.content || log.message || ''
});

const parsePortfolioDecision = (value: unknown): PortfolioDecision | null => {
  if (!value) return null;
  if (typeof value === 'object') return value as PortfolioDecision;
  if (typeof value !== 'string') return null;

  try {
    return JSON.parse(value);
  } catch {
    const match = value.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]);
    } catch {
      return null;
    }
  }
};

const normalizeTickerForProviders = (symbol: string) => {
  // Canonicalize known NSE aliases that break Yahoo/TwelveData lookups.
  if (symbol === 'L&T.NS') return 'LT.NS';
  return symbol;
};

type OrchestrationMarket = 'us' | 'india' | 'crypto';
type EvaluationStatus = 'pending' | 'waiting_for_market' | 'evaluated' | 'invalid' | 'error';
type DirectionalResult = 'correct' | 'incorrect' | 'neutral' | 'not_applicable';

type MarketCalendar = {
  market: OrchestrationMarket;
  timeZone: string;
  openHour: number;
  openMinute: number;
  closeHour: number;
  closeMinute: number;
  holidayDates: Set<string>;
  earlyCloseDates?: Record<string, { hour: number; minute: number }>;
};

type PricePoint = {
  price: number;
  source: string;
  marketTimestamp: string;
};

type LessonContext = {
  lessons: any[];
  text: string;
  by_role: Record<string, string>;
};

const parseCryptoTickerStyle = (sym: string): boolean => {
  const s = sym.toLowerCase().replace(/\s+/g, '');
  if (/^([a-z0-9]{2,10})[/-]?usdt$/i.test(s)) return true;
  if (/^([a-z0-9]{2,10})[/-]?(usd|eur|gbp|jpy)$/i.test(s)) return true;
  if (/^(btc|eth|sol|xrp|doge|ada|bnb|avax)$/i.test(s)) return true;
  return false;
};

const inferMarketFromTicker = (ticker: string): OrchestrationMarket => {
  const t = (ticker || '').trim();
  if (!t) return 'us';
  const u = t.toUpperCase();
  if (u.endsWith('.NS') || u.endsWith('.BO')) return 'india';
  if (parseCryptoTickerStyle(t)) return 'crypto';
  return 'us';
};

const normalizeOrchestrationMarket = (raw: unknown, ticker: string): OrchestrationMarket => {
  if (typeof raw === 'string') {
    const m = raw.trim().toLowerCase();
    if (m === 'india' || m === 'in' || m === 'nse' || m === 'bse') return 'india';
    if (m === 'crypto' || m === 'cryptocurrency') return 'crypto';
    if (m === 'us' || m === 'usa') return 'us';
  }
  return inferMarketFromTicker(ticker || '');
};

const toNumber = (value: unknown): number | null => {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
};

const roundMetric = (value: number | null, decimals = 4) => {
  if (value === null || !Number.isFinite(value)) return null;
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
};

const normalizeDecision = (value: unknown): 'BUY' | 'SELL' | 'HOLD' | null => {
  const raw = String(value ?? '').trim().toUpperCase();
  if (raw.includes('BUY')) return 'BUY';
  if (raw.includes('SELL')) return 'SELL';
  if (raw.includes('HOLD')) return 'HOLD';
  return null;
};

const parseListEnv = (name: string, fallback: string[]) => {
  const configured = Deno.env.get(name);
  if (!configured) return new Set(fallback);
  return new Set(
    configured
      .split(',')
      .map((v) => v.trim())
      .filter(Boolean),
  );
};

// 2026 defaults are seeded from the official exchange calendars available as of May 2026.
// Operators can override without redeploying via TRADING_AGENTS_NYSE_HOLIDAYS / TRADING_AGENTS_NSE_HOLIDAYS.
const NYSE_2026_HOLIDAYS = [
  '2026-01-01',
  '2026-01-19',
  '2026-02-16',
  '2026-04-03',
  '2026-05-25',
  '2026-06-19',
  '2026-07-03',
  '2026-09-07',
  '2026-11-26',
  '2026-12-25',
];

const NSE_2026_HOLIDAYS = [
  '2026-01-15',
  '2026-01-26',
  '2026-02-15',
  '2026-03-03',
  '2026-03-21',
  '2026-03-26',
  '2026-03-31',
  '2026-04-03',
  '2026-04-14',
  '2026-05-01',
  '2026-05-28',
  '2026-06-26',
  '2026-08-15',
  '2026-09-14',
  '2026-10-02',
  '2026-10-20',
  '2026-11-08',
  '2026-11-10',
  '2026-11-24',
  '2026-12-25',
];

const getMarketCalendar = (market: OrchestrationMarket): MarketCalendar | null => {
  if (market === 'crypto') return null;
  if (market === 'india') {
    return {
      market,
      timeZone: 'Asia/Kolkata',
      openHour: 9,
      openMinute: 15,
      closeHour: 15,
      closeMinute: 30,
      holidayDates: parseListEnv('TRADING_AGENTS_NSE_HOLIDAYS', NSE_2026_HOLIDAYS),
    };
  }
  return {
    market,
    timeZone: 'America/New_York',
    openHour: 9,
    openMinute: 30,
    closeHour: 16,
    closeMinute: 0,
    holidayDates: parseListEnv('TRADING_AGENTS_NYSE_HOLIDAYS', NYSE_2026_HOLIDAYS),
    earlyCloseDates: {
      '2026-07-02': { hour: 13, minute: 0 },
      '2026-11-27': { hour: 13, minute: 0 },
      '2026-12-24': { hour: 13, minute: 0 },
    },
  };
};

const getZonedParts = (date: Date, timeZone: string) => {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(date);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  return {
    year: get('year'),
    month: get('month'),
    day: get('day'),
    hour: get('hour'),
    minute: get('minute'),
    second: get('second'),
  };
};

const dateKeyFromParts = (parts: { year: number; month: number; day: number }) =>
  `${parts.year}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`;

const makeZonedDate = (
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  timeZone: string,
) => {
  const desired = Date.UTC(year, month - 1, day, hour, minute, 0, 0);
  let adjusted = new Date(desired);
  for (let i = 0; i < 3; i++) {
    const actualParts = getZonedParts(adjusted, timeZone);
    const actual = Date.UTC(
      actualParts.year,
      actualParts.month - 1,
      actualParts.day,
      actualParts.hour,
      actualParts.minute,
      actualParts.second,
      0,
    );
    adjusted = new Date(adjusted.getTime() + (desired - actual));
  }
  return adjusted;
};

const isTradingDate = (parts: { year: number; month: number; day: number }, calendar: MarketCalendar) => {
  const dateKey = dateKeyFromParts(parts);
  const day = new Date(Date.UTC(parts.year, parts.month - 1, parts.day)).getUTCDay();
  return day !== 0 && day !== 6 && !calendar.holidayDates.has(dateKey);
};

const getSessionWindow = (parts: { year: number; month: number; day: number }, calendar: MarketCalendar) => {
  const dateKey = dateKeyFromParts(parts);
  const earlyClose = calendar.earlyCloseDates?.[dateKey];
  const open = makeZonedDate(
    parts.year,
    parts.month,
    parts.day,
    calendar.openHour,
    calendar.openMinute,
    calendar.timeZone,
  );
  const close = makeZonedDate(
    parts.year,
    parts.month,
    parts.day,
    earlyClose?.hour ?? calendar.closeHour,
    earlyClose?.minute ?? calendar.closeMinute,
    calendar.timeZone,
  );
  return { open, close };
};

const rollToTradableTime = (date: Date, market: OrchestrationMarket) => {
  const calendar = getMarketCalendar(market);
  if (!calendar) return date;

  let candidate = date;
  for (let i = 0; i < 370; i++) {
    const parts = getZonedParts(candidate, calendar.timeZone);
    if (isTradingDate(parts, calendar)) {
      const { open, close } = getSessionWindow(parts, calendar);
      if (candidate < open) return open;
      if (candidate <= close) return candidate;
    }

    const nextParts = getZonedParts(
      makeZonedDate(parts.year, parts.month, parts.day + 1, 12, 0, calendar.timeZone),
      calendar.timeZone,
    );
    candidate = makeZonedDate(
      nextParts.year,
      nextParts.month,
      nextParts.day,
      calendar.openHour,
      calendar.openMinute,
      calendar.timeZone,
    );
  }
  throw new Error(`Could not resolve next tradable time for ${market}`);
};

const isInsideRegularSession = (date: Date, market: OrchestrationMarket) => {
  const calendar = getMarketCalendar(market);
  if (!calendar) return true;
  const parts = getZonedParts(date, calendar.timeZone);
  if (!isTradingDate(parts, calendar)) return false;
  const { open, close } = getSessionWindow(parts, calendar);
  return date >= open && date <= close;
};

const resolveEntryTimestamp = (session: any, market: OrchestrationMarket) => {
  const existing = session.entry_market_timestamp ? new Date(session.entry_market_timestamp) : null;
  if (existing && Number.isFinite(existing.getTime())) return existing;
  const createdAt = new Date(session.created_at);
  if (market === 'crypto' || isInsideRegularSession(createdAt, market)) return createdAt;
  return rollToTradableTime(createdAt, market);
};

const resolveDueTimestamp = (entryAt: Date, market: OrchestrationMarket, horizon = '24h') => {
  const hours = Number(String(horizon).match(/(\d+(?:\.\d+)?)h/)?.[1] ?? 24);
  const rawDue = new Date(entryAt.getTime() + hours * 60 * 60 * 1000);
  return market === 'crypto' ? rawDue : rollToTradableTime(rawDue, market);
};

const yahooSymbolForCrypto = (symbol: string) => {
  const upper = String(symbol || '').trim().toUpperCase();
  const usdt = upper.match(/^([A-Z0-9]{2,10})USDT$/);
  if (usdt) return `${usdt[1]}-USD`;
  if (/^(BTC|ETH|SOL|XRP|DOGE|ADA|BNB|AVAX)$/.test(upper)) return `${upper}-USD`;
  return upper;
};

const binanceSymbolFromTicker = (symbol: string) => {
  const upper = String(symbol || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!upper) return 'BTCUSDT';
  if (upper.endsWith('USDT')) return upper;
  if (upper.endsWith('USD')) return `${upper.replace(/USD$/, '')}USDT`;
  return `${upper}USDT`;
};

const fetchYahooPriceAtOrAfter = async (
  symbol: string,
  target: Date,
  sourceLabel: string,
  windowHours = 30,
): Promise<PricePoint | null> => {
  const targetSeconds = Math.floor(target.getTime() / 1000);
  const period1 = Math.max(0, targetSeconds - 300);
  const period2 = targetSeconds + windowHours * 60 * 60;
  const intervals = ['5m', '15m', '1h'];

  for (const interval of intervals) {
    const url =
      `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}` +
      `?period1=${period1}&period2=${period2}&interval=${interval}&includePrePost=false`;
    try {
      const response = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' },
      });
      if (!response.ok) continue;
      const payload = await response.json();
      const result = payload?.chart?.result?.[0];
      const timestamps = Array.isArray(result?.timestamp) ? result.timestamp : [];
      const quote = result?.indicators?.quote?.[0] || {};
      const closes = Array.isArray(quote.close) ? quote.close : [];
      const opens = Array.isArray(quote.open) ? quote.open : [];
      for (let i = 0; i < timestamps.length; i++) {
        const candleTime = Number(timestamps[i]) * 1000;
        const price = toNumber(closes[i]) ?? toNumber(opens[i]);
        if (price && candleTime >= target.getTime()) {
          return {
            price,
            source: `${sourceLabel}:yahoo_chart_${interval}`,
            marketTimestamp: new Date(candleTime).toISOString(),
          };
        }
      }
    } catch (error) {
      console.error(`Yahoo chart price fetch failed for ${symbol}:`, error);
    }
  }

  return null;
};

const fetchBinancePriceAtOrAfter = async (
  ticker: string,
  target: Date,
  windowMinutes = 60,
): Promise<PricePoint | null> => {
  const symbol = binanceSymbolFromTicker(ticker);
  const startTime = target.getTime();
  const endTime = startTime + windowMinutes * 60 * 1000;
  const url =
    `https://api.binance.com/api/v3/klines?symbol=${encodeURIComponent(symbol)}` +
    `&interval=1m&startTime=${startTime}&endTime=${endTime}&limit=1`;
  try {
    const response = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!response.ok) return null;
    const rows = await response.json();
    const row = Array.isArray(rows) ? rows[0] : null;
    if (!Array.isArray(row)) return null;
    const price = toNumber(row[4]) ?? toNumber(row[1]);
    const timestamp = Number(row[0]);
    if (!price || !Number.isFinite(timestamp)) return null;
    return {
      price,
      source: `binance_klines_1m:${symbol}`,
      marketTimestamp: new Date(timestamp).toISOString(),
    };
  } catch (error) {
    console.error(`Binance price fetch failed for ${ticker}:`, error);
    return null;
  }
};

const fetchPriceAtOrAfter = async (
  ticker: string,
  market: OrchestrationMarket,
  target: Date,
  purpose: 'entry' | 'exit' | 'benchmark',
): Promise<PricePoint | null> => {
  if (market === 'crypto') {
    const binance = await fetchBinancePriceAtOrAfter(ticker, target, purpose === 'exit' ? 180 : 60);
    if (binance) return { ...binance, source: `${purpose}:${binance.source}` };
    return fetchYahooPriceAtOrAfter(yahooSymbolForCrypto(ticker), target, `${purpose}:crypto_fallback`, 6);
  }
  return fetchYahooPriceAtOrAfter(ticker, target, purpose, purpose === 'exit' ? 48 : 8);
};

const getBenchmarkSymbol = (ticker: string, market: OrchestrationMarket) => {
  if (market === 'us') return 'SPY';
  if (market === 'india') return '^NSEI';
  const upper = String(ticker || '').toUpperCase();
  return upper.startsWith('BTC') ? null : 'BTCUSDT';
};

const getNoTradeBandPct = (market: OrchestrationMarket) => {
  if (market === 'india') return 0.35;
  if (market === 'crypto') return 0.75;
  return 0.25;
};

const computeDirectionalOutcome = (
  decision: 'BUY' | 'SELL' | 'HOLD' | null,
  rawReturnPct: number,
  market: OrchestrationMarket,
): { outcome: 'WIN' | 'LOSS' | 'NEUTRAL' | 'INVALID'; directionalResult: DirectionalResult } => {
  if (!decision) return { outcome: 'INVALID', directionalResult: 'not_applicable' };
  const band = getNoTradeBandPct(market);
  if (decision === 'HOLD') return { outcome: 'NEUTRAL', directionalResult: 'neutral' };
  if (Math.abs(rawReturnPct) <= band) return { outcome: 'NEUTRAL', directionalResult: 'neutral' };
  if (decision === 'BUY') {
    return rawReturnPct > band
      ? { outcome: 'WIN', directionalResult: 'correct' }
      : { outcome: 'LOSS', directionalResult: 'incorrect' };
  }
  return rawReturnPct < -band
    ? { outcome: 'WIN', directionalResult: 'correct' }
    : { outcome: 'LOSS', directionalResult: 'incorrect' };
};

const confidenceToScore = (confidence: unknown) => {
  const value = String(confidence ?? '').toLowerCase();
  if (value.includes('high')) return 0.85;
  if (value.includes('low')) return 0.35;
  if (value.includes('medium')) return 0.6;
  return null;
};

const writeEvaluationEvent = async (supabase: any, sessionId: string, eventType: string, details: Record<string, unknown>) => {
  try {
    await supabase.from('trading_evaluation_events').insert({
      session_id: sessionId,
      event_type: eventType,
      details,
    });
  } catch (error) {
    console.error(`Could not write evaluation event ${eventType}:`, error);
  }
};

const buildFallbackLesson = (
  ticker: string,
  decision: string,
  outcome: string,
  rawReturnPct: number,
  alphaReturnPct: number | null,
) => {
  const result = outcome === 'WIN' ? 'worked' : outcome === 'LOSS' ? 'missed' : 'was inconclusive';
  const alphaText = alphaReturnPct === null ? 'without benchmark alpha' : `with ${roundMetric(alphaReturnPct, 2)}% alpha`;
  return `${ticker} ${decision} ${result}: price moved ${roundMetric(rawReturnPct, 2)}% ${alphaText}; recalibrate similar signals next run.`;
};

const generateEvaluationLesson = async (
  supabase: any,
  session: any,
  decision: string,
  evidence: Record<string, unknown>,
) => {
  const openaiKey = Deno.env.get('OPENAI_API_KEY');
  const fallback = buildFallbackLesson(
    session.ticker,
    decision,
    String(evidence.outcome),
    Number(evidence.raw_return_pct ?? 0),
    evidence.alpha_return_pct === null ? null : Number(evidence.alpha_return_pct),
  );

  let lesson = fallback;
  let qualityScore = 0.55;
  if (openaiKey) {
    try {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${openaiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [
            {
              role: 'system',
              content:
                'You are a trading evaluation mentor. Return one concise lesson under 28 words. Prefer measurable signal feedback over generic advice.',
            },
            {
              role: 'user',
              content: JSON.stringify({
                ticker: session.ticker,
                thesis: session.investment_thesis || session.executive_summary || null,
                evidence,
              }),
            },
          ],
          max_tokens: 80,
        }),
      });
      if (response.ok) {
        const payload = await response.json();
        const candidate = String(payload?.choices?.[0]?.message?.content ?? '').trim();
        if (candidate) {
          lesson = candidate.replace(/^["']|["']$/g, '');
          qualityScore = 0.75;
        }
      }
    } catch (error) {
      console.error('Failed to generate OpenAI evaluation lesson:', error);
    }
  }

  const signalTags = Array.isArray((evidence as any).signal_tags) ? (evidence as any).signal_tags : [];
  await supabase.from('agent_lessons').insert({
    session_id: session.id,
    source_session_id: session.id,
    ticker: session.ticker,
    lesson,
    lesson_type: 'portfolio',
    evidence,
    applies_to_market: session.market || evidence.market || 'all',
    applies_to_ticker: session.ticker,
    signal_tags: signalTags,
    quality_score: qualityScore,
  });
};

const getDecisionForSession = async (supabase: any, session: any) => {
  if (session.final_decision) {
    return {
      decision: normalizeDecision(session.final_decision),
      confidence: session.confidence_bucket || null,
      thesis: session.investment_thesis || session.executive_summary || null,
      evaluation_horizon: session.evaluation_horizon || '24h',
      signalTags: [] as string[],
    };
  }

  const { data: logs } = await supabase
    .from('trading_logs')
    .select('content')
    .eq('session_id', session.id)
    .eq('agent_role', 'Portfolio Manager')
    .eq('log_type', 'decision')
    .order('created_at', { ascending: false })
    .limit(1);

  const parsed = parsePortfolioDecision(logs?.[0]?.content);
  return {
    decision: normalizeDecision(parsed?.decision),
    confidence: parsed?.confidence || null,
    thesis: parsed?.thesis || session.investment_thesis || session.executive_summary || null,
    evaluation_horizon: parsed?.evaluation_horizon || session.evaluation_horizon || '24h',
    signalTags: Array.isArray(parsed?.signal_tags) ? parsed.signal_tags : [],
  };
};

const markEvaluationState = async (
  supabase: any,
  sessionId: string,
  status: EvaluationStatus,
  updates: Record<string, unknown> = {},
) => {
  await supabase
    .from('trading_sessions')
    .update({
      evaluation_status: status,
      evaluation_error: status === 'error' || status === 'invalid' ? updates.evaluation_error ?? null : null,
      updated_at: new Date().toISOString(),
      ...updates,
    })
    .eq('id', sessionId);
};

const evaluateSession = async (supabase: any, session: any, now = new Date()) => {
  const market = normalizeOrchestrationMarket(session.market, session.ticker);
  const decisionInfo = await getDecisionForSession(supabase, session);
  const decision = decisionInfo.decision;
  if (!decision) {
    await markEvaluationState(supabase, session.id, 'invalid', {
      evaluated: true,
      outcome: 'INVALID',
      directional_result: 'not_applicable',
      evaluated_at: now.toISOString(),
      evaluation_error: 'Missing parseable BUY/SELL/HOLD decision.',
    });
    await writeEvaluationEvent(supabase, session.id, 'invalid_decision', { final_decision: session.final_decision });
    return 'invalid';
  }

  const entryAt = resolveEntryTimestamp(session, market);
  const horizon = session.evaluation_horizon || decisionInfo.evaluation_horizon || '24h';
  const dueAt = session.evaluation_due_at ? new Date(session.evaluation_due_at) : resolveDueTimestamp(entryAt, market, horizon);

  if (entryAt > now || dueAt > now) {
    await markEvaluationState(supabase, session.id, entryAt > now ? 'waiting_for_market' : 'pending', {
      market,
      evaluation_horizon: horizon,
      evaluation_due_at: dueAt.toISOString(),
      entry_market_timestamp: entryAt.toISOString(),
    });
    await writeEvaluationEvent(supabase, session.id, 'not_due', {
      entry_market_timestamp: entryAt.toISOString(),
      evaluation_due_at: dueAt.toISOString(),
    });
    return 'pending';
  }

  let entry: PricePoint | null = null;
  const existingEntryPrice = toNumber(session.entry_price ?? session.execution_price);
  const entryTimestamp = session.entry_market_timestamp ? new Date(session.entry_market_timestamp) : entryAt;
  const canUseRecordedEntry = existingEntryPrice && (market === 'crypto' || isInsideRegularSession(new Date(session.created_at), market));
  if (session.entry_price && session.entry_market_timestamp) {
    entry = {
      price: Number(session.entry_price),
      source: session.entry_price_source || 'recorded_entry',
      marketTimestamp: new Date(session.entry_market_timestamp).toISOString(),
    };
  } else {
    entry = await fetchPriceAtOrAfter(session.ticker, market, entryTimestamp, 'entry');
    if (!entry && canUseRecordedEntry) {
      entry = {
        price: Number(existingEntryPrice),
        source: session.entry_price_source || 'frontend_execution_price',
        marketTimestamp: entryTimestamp.toISOString(),
      };
    }
  }

  if (!entry) {
    await markEvaluationState(supabase, session.id, 'waiting_for_market', {
      market,
      evaluation_horizon: horizon,
      evaluation_due_at: dueAt.toISOString(),
      entry_market_timestamp: entryAt.toISOString(),
      evaluation_error: 'Entry price unavailable. Will retry.',
    });
    await writeEvaluationEvent(supabase, session.id, 'entry_price_missing', { target: entryAt.toISOString() });
    return 'waiting';
  }

  const exit = await fetchPriceAtOrAfter(session.ticker, market, dueAt, 'exit');
  if (!exit) {
    await markEvaluationState(supabase, session.id, 'waiting_for_market', {
      market,
      evaluation_horizon: horizon,
      evaluation_due_at: dueAt.toISOString(),
      entry_price: entry.price,
      entry_price_source: entry.source,
      entry_market_timestamp: entry.marketTimestamp,
      evaluation_error: 'Exit price unavailable. Will retry.',
    });
    await writeEvaluationEvent(supabase, session.id, 'exit_price_missing', { target: dueAt.toISOString() });
    return 'waiting';
  }

  const benchmarkSymbol = getBenchmarkSymbol(session.ticker, market);
  let benchmarkEntry: PricePoint | null = null;
  let benchmarkExit: PricePoint | null = null;
  if (benchmarkSymbol) {
    benchmarkEntry = await fetchPriceAtOrAfter(benchmarkSymbol, market, entryAt, 'benchmark');
    benchmarkExit = await fetchPriceAtOrAfter(benchmarkSymbol, market, dueAt, 'benchmark');
  }

  const rawReturnPct = ((exit.price - entry.price) / entry.price) * 100;
  const benchmarkReturnPct =
    benchmarkEntry && benchmarkExit
      ? ((benchmarkExit.price - benchmarkEntry.price) / benchmarkEntry.price) * 100
      : null;
  const alphaReturnPct = benchmarkReturnPct === null ? null : rawReturnPct - benchmarkReturnPct;
  const directional = computeDirectionalOutcome(decision, rawReturnPct, market);

  const evidence = {
    market,
    decision,
    confidence: decisionInfo.confidence,
    outcome: directional.outcome,
    directional_result: directional.directionalResult,
    entry_price: roundMetric(entry.price, 6),
    entry_price_source: entry.source,
    entry_market_timestamp: entry.marketTimestamp,
    exit_price: roundMetric(exit.price, 6),
    exit_price_source: exit.source,
    exit_market_timestamp: exit.marketTimestamp,
    raw_return_pct: roundMetric(rawReturnPct, 4),
    benchmark_symbol: benchmarkSymbol,
    benchmark_return_pct: roundMetric(benchmarkReturnPct, 4),
    alpha_return_pct: roundMetric(alphaReturnPct, 4),
    no_trade_band_pct: getNoTradeBandPct(market),
    signal_tags: decisionInfo.signalTags,
  };

  await supabase
    .from('trading_sessions')
    .update({
      market,
      evaluation_status: 'evaluated',
      evaluation_horizon: horizon,
      evaluation_due_at: dueAt.toISOString(),
      entry_price: entry.price,
      entry_price_source: entry.source,
      entry_market_timestamp: entry.marketTimestamp,
      exit_price: exit.price,
      exit_price_source: exit.source,
      exit_market_timestamp: exit.marketTimestamp,
      raw_return_pct: roundMetric(rawReturnPct, 6),
      benchmark_symbol: benchmarkSymbol,
      benchmark_entry_price: benchmarkEntry?.price ?? null,
      benchmark_exit_price: benchmarkExit?.price ?? null,
      benchmark_return_pct: roundMetric(benchmarkReturnPct, 6),
      alpha_return_pct: roundMetric(alphaReturnPct, 6),
      directional_result: directional.directionalResult,
      confidence_bucket: decisionInfo.confidence,
      confidence_score: confidenceToScore(decisionInfo.confidence),
      outcome: directional.outcome,
      evaluated: true,
      evaluated_at: now.toISOString(),
      evaluation_error: null,
      updated_at: now.toISOString(),
    })
    .eq('id', session.id);

  await writeEvaluationEvent(supabase, session.id, 'evaluated', evidence);
  await generateEvaluationLesson(supabase, session, decision, evidence);
  return 'evaluated';
};

const buildLessonsContext = async (
  supabase: any,
  ticker: string,
  market: OrchestrationMarket,
  limit = 8,
): Promise<LessonContext> => {
  const { data, error } = await supabase
    .from('agent_lessons')
    .select('id,ticker,lesson,lesson_type,evidence,applies_to_market,applies_to_ticker,signal_tags,quality_score,created_at')
    .order('created_at', { ascending: false })
    .limit(40);

  if (error) throw error;
  const upperTicker = String(ticker || '').toUpperCase();
  const relevant = (data || [])
    .filter((lesson: any) => {
      const lessonMarket = String(lesson.applies_to_market || 'all').toLowerCase();
      const lessonTicker = String(lesson.applies_to_ticker || lesson.ticker || '').toUpperCase();
      return lessonMarket === 'all' || lessonMarket === market || lessonTicker === upperTicker;
    })
    .slice(0, limit);

  const toLine = (lesson: any) => {
    const type = lesson.lesson_type || 'portfolio';
    const tags = Array.isArray(lesson.signal_tags) && lesson.signal_tags.length
      ? ` [${lesson.signal_tags.slice(0, 3).join(', ')}]`
      : '';
    return `- ${lesson.ticker || lesson.applies_to_ticker || 'ALL'} / ${type}${tags}: ${lesson.lesson}`;
  };

  const byRole: Record<string, string> = {
    technical: relevant
      .filter((l: any) => ['technical', 'market_structure', 'portfolio'].includes(l.lesson_type || 'portfolio'))
      .slice(0, 4)
      .map(toLine)
      .join('\n'),
    news: relevant
      .filter((l: any) => ['news', 'portfolio'].includes(l.lesson_type || 'portfolio'))
      .slice(0, 4)
      .map(toLine)
      .join('\n'),
    fundamentals: relevant
      .filter((l: any) => ['fundamentals', 'portfolio'].includes(l.lesson_type || 'portfolio'))
      .slice(0, 4)
      .map(toLine)
      .join('\n'),
    social: relevant
      .filter((l: any) => ['social', 'portfolio'].includes(l.lesson_type || 'portfolio'))
      .slice(0, 4)
      .map(toLine)
      .join('\n'),
    portfolio: relevant.slice(0, 6).map(toLine).join('\n'),
  };

  return {
    lessons: relevant,
    text: relevant.length
      ? `Prior evaluated lessons for ${ticker} (${market}):\n${relevant.map(toLine).join('\n')}`
      : `No prior evaluated lessons found for ${ticker} (${market}).`,
    by_role: byRole,
  };
};

const persistWorkflowResult = async (
  supabase: any,
  sessionId: string | undefined,
  result: any
) => {
  if (!sessionId || !result || typeof result !== 'object') return;

  if (Array.isArray(result.logs)) {
    const logs = result.logs.map((log: AgentLogInput) => ({
      session_id: sessionId,
      ...normalizeAgentLog(log)
    }));
    if (logs.length > 0) {
      await supabase.from('trading_logs').insert(logs);
    }
  }

  const decision = parsePortfolioDecision(result.portfolio_decision || result.decision || result.output);
  if (!decision?.decision) return;

  const content = JSON.stringify({
    decision: decision.decision,
    confidence: decision.confidence || 'Medium',
    thesis: decision.thesis || result.executive_summary || '',
    risk_flags: Array.isArray(decision.risk_flags) ? decision.risk_flags : [],
    signal_tags: Array.isArray(decision.signal_tags) ? decision.signal_tags : [],
    evaluation_horizon: decision.evaluation_horizon || '24h',
  });

  await supabase.from('trading_logs').insert({
    session_id: sessionId,
    agent_role: 'Portfolio Manager',
    log_type: 'decision',
    content
  });

  await supabase.from('trading_sessions').update({
    status: 'completed',
    final_decision: decision.decision,
    confidence_bucket: decision.confidence || null,
    evaluation_horizon: decision.evaluation_horizon || '24h',
    executive_summary: decision.thesis || result.executive_summary || null,
    investment_thesis: decision.thesis || null,
    updated_at: new Date().toISOString()
  }).eq('id', sessionId);
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
      return new Response('ok', { headers: corsHeaders })
  }

  try {
    const body = await req.json()
    const { action, ticker, date, session_id } = body;

    // Validate ticker to prevent path traversal / injection attacks
    const safeTickerRegex = /^[A-Za-z0-9._\-\^]+$/;
    if (ticker && !safeTickerRegex.test(ticker)) {
        return jsonResponse({ error: `Invalid ticker format: ${ticker}` }, 400);
    }
    
    // Also validate 'tickers' if action is recon
    if (action === 'recon' && body.tickers) {
      const tickersArray = body.tickers.split(',');
      for (const t of tickersArray) {
        if (!safeTickerRegex.test(t)) {
          return jsonResponse({ error: `Invalid ticker format in batch: ${t}` }, 400);
        }
      }
    }

    /**
     * Incremental log line for live UI (call from n8n after each agent step).
     * One HTTP request → one row → Realtime pushes to the client. Same webhook
     * cannot return multiple bodies; streaming is done via the database + Realtime.
     *
     * n8n: HTTP Request POST to this function URL with header:
     *   x-trading-agents-secret: <N8N_WEBHOOK_SECRET>
     * Body: { "action": "append_agent_log", "session_id": "<uuid>", "agent_role": "...", "content": "..." }
     */
    if (action === 'append_agent_log') {
      const n8nSecret = TRADING_AGENTS_WEBHOOK_SECRET;
      if (!n8nSecret || req.headers.get('x-trading-agents-secret') !== n8nSecret) {
        return jsonResponse({ error: 'Forbidden' }, 403);
      }

      const sid = body.session_id as string;
      const uuidRe =
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      if (!sid || !uuidRe.test(sid)) {
        return jsonResponse({ error: 'session_id must be a valid UUID' }, 400);
      }

      const rawContent = body.content ?? body.message;
      const content =
        typeof rawContent === 'string'
          ? rawContent
          : rawContent != null
            ? JSON.stringify(rawContent)
            : '';
      if (!content) {
        return jsonResponse({ error: 'content or message required' }, 400);
      }

      const agent_role = String(body.agent_role || body.agent || 'Agent').slice(0, 200);
      const log_type = String(body.log_type || 'research').slice(0, 100);
      const trimmed =
        content.length > 500_000 ? `${content.slice(0, 500_000)}…` : content;

      const supabase = getServiceClient();
      const { error: insErr } = await supabase.from('trading_logs').insert({
        session_id: sid,
        agent_role,
        log_type,
        content: trimmed,
      });
      if (insErr) throw insErr;

      return jsonResponse({ success: true });
    }

    if (action === 'get_finnhub_token') {
      if (Deno.env.get('ALLOW_CLIENT_FINNHUB_TOKEN') !== 'true') {
        return jsonResponse({ error: 'Client Finnhub token access is disabled.' }, 403);
      }

      const token = Deno.env.get('FINNHUB_API_KEY');
      if (!token) {
        return jsonResponse({ error: 'Finnhub API key not configured in Edge Function secrets.' }, 500);
      }
      return jsonResponse({ token });
    }

    if (action === 'batch_quote') {
      const symbols: string = body.symbols || '';
      if (!symbols) {
        return jsonResponse({ error: 'symbols required', quotes: [] }, 400);
      }

      const symbolList = symbols
        .split(',')
        .map((s: string) => normalizeTickerForProviders(s.trim()))
        .filter(Boolean)
        .slice(0, 50);
      const isIndianMarket = symbolList[0]?.endsWith('.NS') || symbolList[0]?.endsWith('.BO');
      const twelveDataKey = Deno.env.get('TWELVEDATA_API_KEY');
      const finnhubKey = Deno.env.get('FINNHUB_API_KEY');

      // ─── Tier 1: TwelveData (batched in chunks of 8 symbols) ────────────────
      if (twelveDataKey) {
        try {
          const quotes: { symbol: string; price: number; isRest: boolean; previousClose?: number }[] = [];
          const tdChunks: string[][] = [];
          for (let i = 0; i < symbolList.length; i += 8) {
            tdChunks.push(symbolList.slice(i, i + 8));
          }

          for (const chunk of tdChunks) {
            const batch = chunk
              .map(s => {
                const isIndian = s.endsWith('.NS') || s.endsWith('.BO');
                return isIndian ? s.replace('.NS', '').replace('.BO', '') + ':NSE' : s;
              })
              .join(',');

            const tdRes = await fetch(`https://api.twelvedata.com/price?symbol=${encodeURIComponent(batch)}&apikey=${twelveDataKey}`);
            const tdData = await tdRes.json();

            if (tdData && !tdData.code && typeof tdData === 'object') {
              if (chunk.length === 1) {
                  if (tdData.price) quotes.push({ symbol: chunk[0], price: parseFloat(tdData.price), isRest: true });
              } else {
                for (let i = 0; i < chunk.length; i++) {
                  const key = Object.keys(tdData)[i];
                  const entry = key ? tdData[key] : null;
                  if (entry?.price && !entry.code) quotes.push({ symbol: chunk[i], price: parseFloat(entry.price), isRest: true });
                }
              }
            }
          }

          if (quotes.length > 0) {
            return jsonResponse({ quotes });
          }
        } catch (e) {
          console.error('TwelveData batch failed:', e);
        }
      }

      // ─── Tier 2 (US only): Finnhub REST — uses the key we already have ───────
      if (!isIndianMarket && finnhubKey) {
        try {
          const quotes: { symbol: string; price: number; isRest: boolean; previousClose?: number }[] = [];
          await Promise.allSettled(symbolList.slice(0, 10).map(async (sym) => {
            const r = await fetch(`https://finnhub.io/api/v1/quote?symbol=${sym}&token=${finnhubKey}`);
            const d = await r.json();
            // Finnhub returns { c: currentPrice, pc: prevClose, ... }; c=0 means no data
            if (d?.c && d.c > 0) quotes.push({ symbol: sym, price: d.c, previousClose: d.pc, isRest: true });
          }));
          if (quotes.length > 0) {
            return jsonResponse({ quotes });
          }
        } catch (e) {
          console.error('Finnhub REST batch failed:', e);
        }
      }

      // ─── Tier 3: Yahoo Finance PUBLIC API (no key) — US + Indian .NS ─────────
      try {
        const batchList = symbolList.slice(0, 50);
        const quotes: { symbol: string; price: number; isRest: boolean; previousClose?: number }[] = [];

        if (isIndianMarket) {
          // Indian stocks: v8/finance/chart works without auth (individual calls in parallel)
          await Promise.allSettled(batchList.map(async (sym) => {
            try {
              const r = await fetch(
                `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?interval=1d&range=1d`,
                { headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36', 'Accept': 'application/json' } }
              );
              if (r.ok) {
                const d = await r.json();
                const meta = d?.chart?.result?.[0]?.meta;
                const price = meta?.regularMarketPrice;
                const previousClose = meta?.previousClose ?? meta?.chartPreviousClose;
                if (price) quotes.push({ symbol: sym, price, previousClose, isRest: true });
              }
            } catch (_) {}
          }));
        } else {
          // US stocks: v7 batch endpoint
          const yhRes = await fetch(
            `https://query2.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(batchList.join(','))}&fields=regularMarketPrice`,
            { headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36', 'Accept': 'application/json' } }
          );
          if (yhRes.ok) {
            const yhData = await yhRes.json();
            const results = yhData?.quoteResponse?.result || [];
            results.filter((q: any) => q?.regularMarketPrice)
              .forEach((q: any) => quotes.push({
                symbol: q.symbol,
                price: q.regularMarketPrice,
                previousClose: q.regularMarketPreviousClose,
                isRest: true
              }));
          }
        }

        if (quotes.length > 0) {
          return jsonResponse({ quotes });
        }
      } catch (e) {
        console.error('Yahoo public API failed:', e);
      }

      return jsonResponse({ quotes: [] });
    }


    if (action === 'evaluate') {
      const forbidden = requireAdminToken(req);
      if (forbidden) return forbidden;

      const supabase = getServiceClient();
      const batchLimit = Math.max(1, Math.min(Number(body.limit || 20), 50));
      const { data: evaluationQueue, error: fetchErr } = await supabase
        .from('trading_sessions')
        .select('*')
        .eq('status', 'completed')
        .or('evaluated.eq.false,evaluation_status.in.(pending,waiting_for_market,error)')
        .order('created_at', { ascending: true })
        .limit(batchLimit);
        
      if (fetchErr) throw fetchErr;

      const summary: Record<string, number> = {
        queued: evaluationQueue?.length ?? 0,
        evaluated: 0,
        pending: 0,
        waiting: 0,
        invalid: 0,
        errors: 0,
      };

      for (const session of evaluationQueue || []) {
        try {
          const result = await evaluateSession(supabase, session);
          if (result === 'evaluated') summary.evaluated++;
          else if (result === 'pending') summary.pending++;
          else if (result === 'waiting') summary.waiting++;
          else if (result === 'invalid') summary.invalid++;
        } catch (e) {
          console.error(`Evaluation failed for session ${session.id}:`, e);
          summary.errors++;
          await markEvaluationState(supabase, session.id, 'error', {
            evaluation_error: getErrorMessage(e),
          });
          await writeEvaluationEvent(supabase, session.id, 'evaluation_error', {
            error: getErrorMessage(e),
          });
        }
      }

      return jsonResponse({ success: true, ...summary });
    }

    if (action === 'lessons_context') {
      if (!ticker) {
        return jsonResponse({ error: 'Ticker is required' }, 400);
      }
      const supabase = getServiceClient();
      const market = normalizeOrchestrationMarket(body.market, ticker);
      const context = await buildLessonsContext(supabase, ticker, market, Number(body.limit || 8));
      return jsonResponse(context);
    }

    if (!ticker && action !== 'recon') {
      return jsonResponse({ error: 'Ticker is required' }, 400)
    }

    /** Hostinger yfinance FastAPI `/research` — proxied so the browser never calls the VPS directly. */
    if (action === 'vps_yfinance_research') {
      const base = (Deno.env.get('TRADING_AGENTS_RESEARCH_BASE_URL') || 'http://72.61.231.160:8001/research').replace(
        /\/$/,
        '',
      );
      const url = `${base}?ticker=${encodeURIComponent(String(ticker))}`;
      try {
        const res = await fetch(url, {
          headers: { Accept: 'application/json', 'User-Agent': 'TradingAgentsProxy/1.0' },
          signal: AbortSignal.timeout(45_000),
        });
        const text = await res.text();
        let body: unknown;
        try {
          body = text ? JSON.parse(text) : {};
        } catch {
          body = { error: text || 'Invalid JSON from research service' };
        }
        const errMsg =
          typeof body === 'object' && body !== null && 'error' in (body as Record<string, unknown>)
            ? String((body as Record<string, unknown>).error)
            : null;
        if (!res.ok) {
          return jsonResponse(
            { error: errMsg || `Research service HTTP ${res.status}` },
            res.status === 429 ? 429 : res.status >= 400 && res.status < 600 ? res.status : 502,
          );
        }
        // Upstream may return 200 + { error: "..." } (e.g. rate limit from yfinance).
        const rateLimited =
          errMsg &&
          /too many requests|rate limit|429/i.test(errMsg);
        if (rateLimited) {
          return jsonResponse({ error: errMsg }, 429);
        }
        return jsonResponse(body);
      } catch (e) {
        return jsonResponse({ error: getErrorMessage(e) }, 502);
      }
    }

    if (action === 'deep_research') {
      try {
        const isIndian = ticker.endsWith('.NS') || ticker.endsWith('.BO');
        
        // 1. Get fundamental info from v7/v8
        const yhUrl = `https://query2.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(ticker)}&fields=regularMarketPrice,regularMarketPreviousClose,trailingPE,forwardPE,marketCap,fiftyTwoWeekHigh,fiftyTwoWeekLow,dividendYield,targetMeanPrice,recommendationKey,longBusinessSummary,sector,industry`;
        
        const yhRes = await fetch(yhUrl, {
          headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36' }
        });
        
        if (yhRes.ok) {
          const yhData = await yhRes.json();
          const info = yhData?.quoteResponse?.result?.[0];
          
          if (info) {
            return jsonResponse({
              ticker: ticker,
              name: info.longName || info.shortName,
              sector: info.sector,
              industry: info.industry,
              summary: info.longBusinessSummary,
              price: info.regularMarketPrice,
              prevClose: info.regularMarketPreviousClose,
              pe: info.trailingPE || info.forwardPE,
              marketCap: info.marketCap,
              range52w: `${info.fiftyTwoWeekLow} - ${info.fiftyTwoWeekHigh}`,
              dividendYield: info.dividendYield,
              analystTarget: info.targetMeanPrice,
              recommendation: info.recommendationKey
            });
          }
        }
        
        return jsonResponse({ error: 'No research data found' });
      } catch (e) {
        return jsonResponse({ error: getErrorMessage(e) }, 500);
      }
    }

    if (action === 'quote') {
      console.log(`Fetching live quote for ${ticker} from TwelveData...`);
      
      const twelveDataKey = Deno.env.get('TWELVEDATA_API_KEY');
      const rapidApiKey = Deno.env.get('RAPIDAPI_KEY');
      
      // Attempt 1: TwelveData
      if (twelveDataKey) {
        try {
           const isIndian = ticker.endsWith('.NS') || ticker.endsWith('.BO');
           const cleanTicker = ticker.replace('.NS', '').replace('.BO', '');
           const exchangeParam = isIndian ? '&exchange=NSE' : '';
           const tdUrl = `https://api.twelvedata.com/quote?symbol=${cleanTicker}${exchangeParam}&apikey=${twelveDataKey}`;
           const tdRes = await fetch(tdUrl);
           const tdData = await tdRes.json();
           
           if (tdData && !tdData.code) { // TwelveData returns 'code' on error
             return jsonResponse({
                  ticker: ticker,
                  price: parseFloat(tdData.close),
                  currency: tdData.currency,
                  previousClose: parseFloat(tdData.previous_close),
                  change: parseFloat(tdData.change),
                  changePercent: parseFloat(tdData.percent_change)
                });
           }
        } catch (e) {
           console.error("TwelveData fetch failed, falling back to RapidAPI...");
        }
      }

      // Attempt 2: Yahoo RapidAPI (Fallback)
      if (rapidApiKey) {
        console.log(`Falling back to Yahoo RapidAPI for ${ticker}...`);
        const yahooUrl = `https://yh-finance.p.rapidapi.com/stock/v2/get-chart?interval=1d&symbol=${ticker}&range=1d`;
        
        const yahooRes = await fetch(yahooUrl, {
          headers: {
            'X-RapidAPI-Key': rapidApiKey,
            'X-RapidAPI-Host': 'yh-finance.p.rapidapi.com'
          }
        });

        if (yahooRes.ok) {
          const yahooData = await yahooRes.json();
          const meta = yahooData?.chart?.result?.[0]?.meta;
          
          if (meta && meta.regularMarketPrice) {
            return jsonResponse({
                ticker: meta.symbol,
                price: meta.regularMarketPrice,
                currency: meta.currency,
                previousClose: meta.chartPreviousClose,
                change: meta.regularMarketPrice - meta.chartPreviousClose,
                changePercent: ((meta.regularMarketPrice - meta.chartPreviousClose) / meta.chartPreviousClose) * 100
              });
          }
        }
      }

      // Attempt 3: Yahoo Finance public endpoints (no key)
      try {
        const isIndian = ticker.endsWith('.NS') || ticker.endsWith('.BO');
        if (isIndian) {
          const yahooRes = await fetch(
            `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=1d&range=5d`,
            { headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json' } }
          );

          if (yahooRes.ok) {
            const yahooData = await yahooRes.json();
            const meta = yahooData?.chart?.result?.[0]?.meta;
            const price = meta?.regularMarketPrice;
            const previousClose = meta?.previousClose ?? meta?.chartPreviousClose;
            if (price) {
              const change = previousClose ? price - previousClose : 0;
              const changePercent = previousClose ? (change / previousClose) * 100 : 0;
              return jsonResponse({
                ticker,
                price,
                currency: meta?.currency ?? 'INR',
                previousClose,
                change,
                changePercent,
              });
            }
          }
        } else {
          const yahooRes = await fetch(
            `https://query2.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(ticker)}`,
            { headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json' } }
          );

          if (yahooRes.ok) {
            const yahooData = await yahooRes.json();
            const quote = yahooData?.quoteResponse?.result?.[0];
            if (quote?.regularMarketPrice) {
              const previousClose = quote?.regularMarketPreviousClose;
              const change = previousClose ? quote.regularMarketPrice - previousClose : 0;
              const changePercent = previousClose ? (change / previousClose) * 100 : 0;
              return jsonResponse({
                ticker: quote.symbol ?? ticker,
                price: quote.regularMarketPrice,
                currency: quote.currency,
                previousClose,
                change,
                changePercent,
              });
            }
          }
        }
      } catch (e) {
        console.error("Yahoo public quote fallback failed:", e);
      }

      return jsonResponse({ error: 'Failed to fetch quote from all available providers.' }, 500);
    }

    // Default action: Trigger n8n
    const n8nWebhookUrl = action === 'recon'
      ? Deno.env.get('TRADING_AGENTS_RECON_WEBHOOK_URL') ||
        Deno.env.get('N8N_RECON_WEBHOOK_URL') ||
        Deno.env.get('TRADING_AGENTS_RUN_WEBHOOK_URL') ||
        Deno.env.get('N8N_WEBHOOK_URL')
      : Deno.env.get('TRADING_AGENTS_RUN_WEBHOOK_URL') ||
        Deno.env.get('N8N_WEBHOOK_URL')
    
    if (!n8nWebhookUrl) {
       console.error("N8N_WEBHOOK_URL is not set");
       return jsonResponse({ error: 'Internal Server Error: Missing N8N config' }, 500)
    }

    const tickerForMarket =
      (typeof ticker === 'string' && ticker.trim()) ||
      (typeof body.tickers === 'string' && body.tickers.split(',')[0]?.trim()) ||
      '';
    const market = normalizeOrchestrationMarket(body.market, tickerForMarket);
    const supabase = action === 'run' ? getServiceClient() : null;
    const lessonsContext = action === 'run' && supabase && ticker
      ? await buildLessonsContext(supabase, ticker, market).catch((error) => {
          console.error('Could not build lessons context:', error);
          return null;
        })
      : null;

    if (action === 'run' && supabase && session_id) {
      const { error: sessionErr } = await supabase.from('trading_sessions').upsert({
        id: session_id,
        ticker,
        market,
        status: 'running',
        execution_price: body.execution_price ?? null,
        entry_price: body.execution_price ?? null,
        entry_price_source: body.execution_price_source || 'frontend_quote',
        evaluation_status: 'pending',
        evaluation_horizon: body.evaluation_horizon || '24h',
        evaluated: false,
        updated_at: new Date().toISOString()
      });
      if (sessionErr) throw sessionErr;

      await supabase.from('trading_logs').insert({
        session_id,
        agent_role: 'System',
        log_type: 'status',
        content: `Queued Trading Agents workflow for ${ticker}.`
      });
    }

    console.log(`Proxying request for ${ticker} to n8n...`);

    const n8nHeaders: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    const n8nSecret = TRADING_AGENTS_WEBHOOK_SECRET;
    if (n8nSecret) {
      n8nHeaders['x-trading-agents-secret'] = n8nSecret;
    }

    const callN8n = async () => {
      const n8nResponse = await fetch(n8nWebhookUrl, {
      method: 'POST',
      headers: n8nHeaders,
      body: JSON.stringify({
        action,
        ticker,
        tickers: body.tickers,
        session_id,
        date: date || new Date().toISOString().split('T')[0],
        execution_price:
          body.execution_price === undefined || body.execution_price === null
            ? null
            : Number(body.execution_price),
        market,
        lessons_context: lessonsContext?.text ?? '',
        lessons_by_role: lessonsContext?.by_role ?? {},
      }),
      })

      if (!n8nResponse.ok) {
        console.error(`n8n responded with status ${n8nResponse.status}`);
        throw new Error('Failed to process trading agent workflow');
      }

      const result = await n8nResponse.json();
      if (action === 'run' && supabase) {
        await persistWorkflowResult(supabase, session_id, result);
      }
      return result;
    };

    if (action === 'run' && Deno.env.get('TRADING_AGENTS_ASYNC_RUN') === 'true') {
      const edgeRuntime = (globalThis as any).EdgeRuntime;
      const pendingRun = callN8n().catch(async (error) => {
        console.error('Async n8n run failed:', error.message);
        if (supabase && session_id) {
          await supabase.from('trading_sessions').update({
            status: 'failed',
            updated_at: new Date().toISOString()
          }).eq('id', session_id);
          await supabase.from('trading_logs').insert({
            session_id,
            agent_role: 'System',
            log_type: 'error',
            content: error.message
          });
        }
      });

      if (edgeRuntime?.waitUntil) {
        edgeRuntime.waitUntil(pendingRun);
      }

      return jsonResponse({ success: true, session_id, queued: true });
    }

    let result;
    try {
      result = await callN8n();
    } catch (_error) {
      if (action === 'run' && supabase && session_id) {
        await supabase.from('trading_sessions').update({
          status: 'failed',
          updated_at: new Date().toISOString()
        }).eq('id', session_id);
      }

      return jsonResponse({ error: 'Failed to process trading agent workflow' }, 502);
    }
    
    // For recon action, we expect { opportunities: [...] }
    if (action === 'recon' && Array.isArray(result.opportunities)) {
       return jsonResponse(result)
    }

    return jsonResponse(result)
  } catch (error) {
    console.error('Error proxying to n8n:', getErrorMessage(error))
    return jsonResponse({ error: getErrorMessage(error) }, 500)
  }
})
