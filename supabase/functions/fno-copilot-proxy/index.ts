import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.46.1";
import { resolveLiveMarketBundle } from "./upstox_live.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-fno-copilot-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type Action =
  | "bootstrap"
  | "market_overview"
  | "dashboard_overall_market"
  | "dashboard_activity"
  | "dashboard_insights"
  | "events_calendar"
  | "options_dashboard"
  | "contract_detail"
  | "option_chain"
  | "combined_oi"
  | "technicals"
  | "build_up"
  | "quick_trades"
  | "trade_analysis"
  | "top5_trades"
  | "chat_message"
  | "ai_ask"
  | "ai_create_trade"
  | "ai_create_algo_strategy"
  | "ai_create_screener"
  | "option_screener_query"
  | "option_screener_save"
  | "compile_algo_form"
  | "validate_trade"
  | "validate_algo_strategy"
  | "finalize_trade"
  | "finalize_algo_strategy"
  | "backtest"
  | "backtest_trade"
  | "backtest_algo_strategy"
  | "paper_trade_create"
  | "paper_trade_mark"
  | "paper_trade_close"
  | "append_workflow_log"
  | "upstox_auth_exchange"
  | "upstox_fetch_live";

const allowedActions = new Set<Action>([
  "bootstrap",
  "market_overview",
  "dashboard_overall_market",
  "dashboard_activity",
  "dashboard_insights",
  "events_calendar",
  "options_dashboard",
  "contract_detail",
  "option_chain",
  "combined_oi",
  "technicals",
  "build_up",
  "quick_trades",
  "trade_analysis",
  "top5_trades",
  "chat_message",
  "ai_ask",
  "ai_create_trade",
  "ai_create_algo_strategy",
  "ai_create_screener",
  "option_screener_query",
  "option_screener_save",
  "compile_algo_form",
  "validate_trade",
  "validate_algo_strategy",
  "finalize_trade",
  "finalize_algo_strategy",
  "backtest",
  "backtest_trade",
  "backtest_algo_strategy",
  "paper_trade_create",
  "paper_trade_mark",
  "paper_trade_close",
  "append_workflow_log",
  "upstox_auth_exchange",
  "upstox_fetch_live",
]);

const demoOverview = {
  instrument: {
    symbol: "NIFTY",
    name: "Nifty 50 Index Options",
    lotSize: 50,
    expiry: "2026-05-28",
    spot: 22842.25,
    previousClose: 22705.1,
    snapshotTs: "2026-05-26T10:12:00+05:30",
  },
  regime: "range-bound",
  volatilityRegime: "normal",
  trendScore: 62,
  chain: {
    pcrOi: 0.94,
    pcrVolume: 0.72,
    maxPain: 22900,
    callWall: 23000,
    putWall: 22800,
    expectedMoveStraddle: 342.5,
    expectedMoveIv: 223.4,
    atmIv: 15.6,
    skew: 2.7,
    termSlope: -1.2,
    quoteAgeSec: 45,
    liquidityScore: 82.4,
    qualityFlags: [],
  },
};

const demoTop5 = [
  {
    id: "demo-iron-condor",
    title: "Range Credit: Iron Condor",
    strategy: "Iron Condor",
    direction: "range-bound",
    score: 82,
    pop: 63,
    maxLoss: 6550,
    maxProfit: 3450,
    breakevens: [22669, 23031],
    qualityFlags: [],
    legs: [
      { side: "BUY", type: "PE", strike: 22400, quantity: 1 },
      { side: "SELL", type: "PE", strike: 22600, quantity: 1 },
      { side: "SELL", type: "CE", strike: 23000, quantity: 1 },
      { side: "BUY", type: "CE", strike: 23200, quantity: 1 },
    ],
  },
  {
    id: "demo-bull-call",
    title: "Directional Debit: Bull Call Spread",
    strategy: "Bull Call Spread",
    direction: "bullish",
    score: 79,
    pop: 46,
    maxLoss: 8550,
    maxProfit: 1450,
    breakevens: [22971],
    qualityFlags: [],
    legs: [
      { side: "BUY", type: "CE", strike: 22800, quantity: 1 },
      { side: "SELL", type: "CE", strike: 23000, quantity: 1 },
    ],
  },
  {
    id: "demo-bear-put",
    title: "Risk Hedge: Bear Put Spread",
    strategy: "Bear Put Spread",
    direction: "bearish",
    score: 76,
    pop: 44,
    maxLoss: 7350,
    maxProfit: 2650,
    breakevens: [22653],
    qualityFlags: [],
    legs: [
      { side: "BUY", type: "PE", strike: 22800, quantity: 1 },
      { side: "SELL", type: "PE", strike: 22600, quantity: 1 },
    ],
  },
  {
    id: "demo-long-straddle",
    title: "ATM Volatility Breakout",
    strategy: "Long Straddle",
    direction: "volatility",
    score: 73,
    pop: 39,
    maxLoss: 18450,
    maxProfit: null,
    breakevens: [22431, 23169],
    qualityFlags: [{ severity: "warning", code: "THETA_NEGATIVE", label: "Theta negative" }],
    legs: [
      { side: "BUY", type: "CE", strike: 22800, quantity: 1 },
      { side: "BUY", type: "PE", strike: 22800, quantity: 1 },
    ],
  },
  {
    id: "demo-iron-fly",
    title: "Pin Risk: Iron Butterfly",
    strategy: "Iron Butterfly",
    direction: "range-bound",
    score: 71,
    pop: 56,
    maxLoss: 9150,
    maxProfit: 5850,
    breakevens: [22683, 22917],
    qualityFlags: [{ severity: "info", code: "PIN_RISK", label: "Pin sensitive" }],
    legs: [
      { side: "BUY", type: "PE", strike: 22500, quantity: 1 },
      { side: "SELL", type: "PE", strike: 22800, quantity: 1 },
      { side: "SELL", type: "CE", strike: 22800, quantity: 1 },
      { side: "BUY", type: "CE", strike: 23100, quantity: 1 },
    ],
  },
];

const demoActivity = {
  callsActive: [
    { symbol: "NIFTY", strike: 23000, type: "CE", price: 84.2, oiChangePct: 12.5, volume: 828300 },
    { symbol: "BANKNIFTY", strike: 50500, type: "CE", price: 182.5, oiChangePct: 8.2, volume: 421500 },
  ],
  callsGainers: [
    { symbol: "COFORGE", strike: 7600, type: "CE", price: 118.1, oiChangePct: 9.1, volume: 73200 },
    { symbol: "HDFCBANK", strike: 780, type: "CE", price: 7.4, oiChangePct: 6.8, volume: 338900 },
  ],
  putsActive: [
    { symbol: "NIFTY", strike: 22800, type: "PE", price: 97.6, oiChangePct: 14.1, volume: 905200 },
    { symbol: "BANKNIFTY", strike: 50000, type: "PE", price: 210.4, oiChangePct: 10.7, volume: 388100 },
  ],
  putsGainers: [
    { symbol: "RELIANCE", strike: 1450, type: "PE", price: 18.7, oiChangePct: 11.4, volume: 161200 },
    { symbol: "ICICIBANK", strike: 1120, type: "PE", price: 10.2, oiChangePct: 7.7, volume: 122800 },
  ],
};

const demoEvents = [
  { date: "2026-05-26", title: "Weekly options expiry", impact: "high", warning: "gamma risk" },
  { date: "2026-05-27", title: "Banking results window", impact: "medium", warning: "event IV" },
  { date: "2026-05-29", title: "Macro data watch", impact: "medium", warning: "gap risk" },
  { date: "2026-06-02", title: "Next weekly expiry positioning", impact: "high", warning: "rollover risk" },
];

const demoScreenerResults = [
  { symbol: "NIFTY", type: "CE", strike: 23000, price: 84.2, oi: 8125000, oiChangePct: 12.5, volume: 828300, iv: 15.8, delta: 0.41, liquidity: "A" },
  { symbol: "NIFTY", type: "PE", strike: 22800, price: 97.6, oi: 9213000, oiChangePct: 14.1, volume: 905200, iv: 16.9, delta: -0.48, liquidity: "A" },
  { symbol: "BANKNIFTY", type: "PE", strike: 50000, price: 210.4, oi: 3184000, oiChangePct: 10.7, volume: 388100, iv: 18.4, delta: -0.43, liquidity: "A" },
];

const jsonResponse = (payload: unknown, status = 200) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const getRequestId = (req: Request) =>
  req.headers.get("x-request-id") || crypto.randomUUID();

const getSupabase = () => {
  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) return null;
  return createClient(url, serviceKey);
};

const envelope = (action: Action, requestId: string, data: unknown) =>
  jsonResponse({ ok: true, action, requestId, data });

const errorEnvelope = (
  action: string,
  requestId: string,
  code: string,
  message: string,
  status = 400,
) =>
  jsonResponse(
    { ok: false, action, requestId, error: { code, message } },
    status,
  );

const requireServiceSecret = (req: Request) => {
  const expected = Deno.env.get("FNO_COPILOT_SERVICE_SECRET");
  if (!expected) return true;
  return req.headers.get("x-fno-copilot-secret") === expected;
};

const FNO_AI_ASK_WEBHOOK_URL =
  Deno.env.get("FNO_COPILOT_ASK_AI_WEBHOOK_URL") ||
  "https://n8n.saksham-experiments.com/webhook/fno-copilot-ai-ask";
const FNO_AI_ASK_WEBHOOK_SECRET =
  Deno.env.get("FNO_COPILOT_ASK_AI_WEBHOOK_SECRET") ||
  Deno.env.get("N8N_WEBHOOK_SECRET") ||
  "";

const normalizeN8nBody = (payload: unknown) => {
  if (Array.isArray(payload)) return payload[0] ?? {};
  if (payload && typeof payload === "object") return payload as Record<string, unknown>;
  return {};
};

const callAskAiWorkflow = async (
  body: Record<string, unknown>,
  requestId: string,
) => {
  const timeoutMs = Number(Deno.env.get("FNO_COPILOT_ASK_AI_TIMEOUT_MS") || "15000");
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), Number.isFinite(timeoutMs) ? timeoutMs : 15000);

  try {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "x-request-id": requestId,
    };
    if (FNO_AI_ASK_WEBHOOK_SECRET) {
      headers["x-n8n-secret"] = FNO_AI_ASK_WEBHOOK_SECRET;
    }

    const response = await fetch(FNO_AI_ASK_WEBHOOK_URL, {
      method: "POST",
      headers,
      body: JSON.stringify({
        workflow_type: "ask_ai",
        message: String(body.message || ""),
        question: String(body.message || ""),
        instrument: String(body.instrument || "NIFTY"),
        expiry: String(body.expiry || ""),
        request_id: requestId,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      throw new Error(`Ask AI n8n returned ${response.status}: ${errorText.slice(0, 300)}`);
    }

    const normalized = normalizeN8nBody(await response.json());
    const artifactPayload =
      normalized.artifact && typeof normalized.artifact === "object"
        ? (normalized.artifact as Record<string, unknown>)
        : normalized;

    const assistantMessage =
      String(
        artifactPayload.answer ||
          normalized.answer ||
          normalized.assistant_message ||
          "I reviewed your Ask AI query and prepared an educational explanation.",
      );

    return {
      state: "ready",
      assistant_message: assistantMessage,
      missing_inputs: [],
      artifact: {
        type: String(artifactPayload.artifact_type || artifactPayload.type || "answer"),
        title: String(artifactPayload.title || "Contextual explanation"),
        status: String(artifactPayload.status || "ready"),
      },
    };
  } finally {
    clearTimeout(timeoutId);
  }
};

const buildDemoBootstrapPayload = () => ({
  instruments: [
    demoOverview.instrument,
    {
      symbol: "BANKNIFTY",
      name: "Nifty Bank Index Options",
      lotSize: 15,
      expiry: "2026-05-28",
      spot: 50182.4,
      previousClose: 50014.6,
      snapshotTs: demoOverview.instrument.snapshotTs,
    },
  ],
  overview: demoOverview,
  indexViews: [
    { symbol: "NIFTY", spot: 22842.25, changePct: 0.6, pcr: 0.94, atmIv: 15.6, buildUp: "Long Build Up" },
    { symbol: "BANKNIFTY", spot: 50182.4, changePct: 0.34, pcr: 1.08, atmIv: 18.4, buildUp: "Short Covering" },
  ],
  fiiDii: {
    fiiCash: -1240,
    diiCash: 1870,
    indexFutures: "Long +6%",
    indexOptions: "Put hedge elevated",
  },
  mode: "demo",
  dataSource: "demo",
});

const buildLiveBootstrapPayload = async (symbol = "NIFTY", expiry?: string) => {
  const live = await resolveLiveMarketBundle(symbol, expiry);
  const spot = Number(live.instrument.spot ?? 0);
  const previousClose = Number(live.instrument.previousClose ?? spot);
  const changePct = previousClose ? Number((((spot - previousClose) / previousClose) * 100).toFixed(2)) : 0;
  const analytics = live.overview.chain as Record<string, unknown>;

  return {
    instruments: [live.instrument],
    overview: live.overview,
    optionChain: live.optionChain,
    indexViews: [{
      symbol: live.instrument.symbol,
      spot,
      changePct,
      pcr: analytics.pcrOi,
      atmIv: analytics.atmIv,
      buildUp: "Live OI snapshot",
    }],
    fiiDii: {
      fiiCash: -1240,
      diiCash: 1870,
      indexFutures: "Long +6%",
      indexOptions: "Put hedge elevated",
    },
    mode: live.mode,
    dataSource: live.source,
    marketStatus: live.marketStatus,
    expiry: live.expiry,
  };
};

const resolveBootstrapPayload = async (body: Record<string, unknown>) => {
  const symbol = String(body.instrument || body.symbol || "NIFTY");
  const expiry = body.expiry ? String(body.expiry) : undefined;
  try {
    return await buildLiveBootstrapPayload(symbol, expiry);
  } catch (error) {
    console.warn(
      "Live Upstox bootstrap fallback:",
      error instanceof Error ? error.message : String(error),
    );
    return buildDemoBootstrapPayload();
  }
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  const requestId = getRequestId(req);

  try {
    const body = await req.json().catch(() => ({}));
    const action = String(body.action || "") as Action;

    if (!allowedActions.has(action)) {
      return errorEnvelope(
        action || "unknown",
        requestId,
        "UNSUPPORTED_ACTION",
        `Unsupported action: ${action}`,
        404,
      );
    }

    const supabase = getSupabase();

    if (action === "append_workflow_log") {
      if (!requireServiceSecret(req)) {
        return errorEnvelope(
          action,
          requestId,
          "FORBIDDEN",
          "Invalid service secret",
          403,
        );
      }
      if (supabase) {
        await supabase.from("fno_workflow_logs").insert({
          workflow_type: body.workflow_type || "find_trade",
          entity_id: body.entity_id || null,
          user_id: body.user_id || null,
          state: body.state || "running",
          message: body.message || "Workflow update",
          detail: body.detail || {},
          correlation_id: body.correlation_id || requestId,
        });
      }
      return envelope(action, requestId, { persisted: Boolean(supabase) });
    }

    if (
      action === "bootstrap" ||
      action === "market_overview" ||
      action === "dashboard_overall_market" ||
      action === "options_dashboard"
    ) {
      const payload = await resolveBootstrapPayload(body as Record<string, unknown>);
      return envelope(action, requestId, payload);
    }

    if (action === "dashboard_activity") {
      return envelope(action, requestId, {
        activity: demoActivity,
        buckets: [
          "Most Active by Contract (Calls)",
          "% Contract Gainers (Calls)",
          "% OI Gainers (Calls)",
          "Most Active by Contract (Puts)",
          "% Contract Gainers (Puts)",
          "% OI Gainers (Puts)",
        ],
      });
    }

    if (action === "dashboard_insights") {
      return envelope(action, requestId, {
        insights: [
          "NIFTY is range-bound with balanced PCR; compare range and volatility structures before paying debit.",
          "BANKNIFTY shows short covering; confirm Combined OI before shorting premium.",
          "Demo mode uses deterministic Excel snapshots; the same calculators are reused in Upstox live mode.",
        ],
        news: [
          { title: "Weekly expiry keeps gamma risk elevated near ATM", impact: "high" },
          { title: "Banking counters lead intraday options activity", impact: "medium" },
        ],
      });
    }

    if (action === "events_calendar") {
      return envelope(action, requestId, { events: demoEvents });
    }

    if (
      action === "contract_detail" ||
      action === "option_chain" ||
      action === "combined_oi" ||
      action === "technicals" ||
      action === "build_up"
    ) {
      const symbol = String(body.instrument || "NIFTY");
      try {
        const live = await resolveLiveMarketBundle(symbol, body.expiry ? String(body.expiry) : undefined);
        const analytics = live.overview.chain as Record<string, unknown>;
        return envelope(action, requestId, {
          instrument: live.instrument,
          analytics,
          snapshotTs: live.instrument.snapshotTs,
          qualityFlags: analytics.qualityFlags ?? [],
          tabs: ["overview", "option_chain", "combined_oi", "technicals", "build_up", "quick_trades"],
          optionChain: live.optionChain,
          combinedOi: live.optionChain
            .filter((row) => row.type === "CE" || row.type === "PE")
            .reduce((acc: Array<Record<string, unknown>>, row) => {
              const strike = Number(row.strike);
              const existing = acc.find((item) => Number(item.strike) === strike);
              if (!existing) {
                acc.push({
                  strike,
                  callOi: row.type === "CE" ? Number(row.oi ?? 0) : 0,
                  putOi: row.type === "PE" ? Number(row.oi ?? 0) : 0,
                });
                return acc;
              }
              if (row.type === "CE") existing.callOi = Number(row.oi ?? 0);
              if (row.type === "PE") existing.putOi = Number(row.oi ?? 0);
              return acc;
            }, []),
          mode: live.mode,
          dataSource: live.source,
          marketStatus: live.marketStatus,
          expiry: live.expiry,
        });
      } catch (error) {
        console.warn(
          "Live Upstox contract detail fallback:",
          error instanceof Error ? error.message : String(error),
        );
      }

      return envelope(action, requestId, {
        instrument: demoOverview.instrument,
        analytics: demoOverview.chain,
        snapshotTs: demoOverview.instrument.snapshotTs,
        qualityFlags: [],
        tabs: ["overview", "option_chain", "combined_oi", "technicals", "build_up", "quick_trades"],
        combinedOi: [
          { strike: 22600, callOi: 3400000, putOi: 5120000 },
          { strike: 22800, callOi: 6220000, putOi: 9213000 },
          { strike: 23000, callOi: 8125000, putOi: 4180000 },
        ],
        technicals: {
          trend: "range-bound",
          adx: 24.8,
          rsi: 54.2,
          vwapState: "near vwap",
          buildUp: "mixed OI, range compression",
        },
      });
    }

    if (action === "top5_trades" || action === "quick_trades") {
      return envelope(action, requestId, {
        instrument: body.instrument || "NIFTY",
        expiry: body.expiry || "2026-05-28",
        candidates: demoTop5,
        quickTrades: {
          up: demoTop5.filter((trade) => trade.direction === "bullish").slice(0, 3),
          down: demoTop5.filter((trade) => trade.direction === "bearish").slice(0, 3),
          rangebound: demoTop5.filter((trade) => trade.direction === "range-bound").slice(0, 3),
          volatile: demoTop5.filter((trade) => trade.direction === "volatility").slice(0, 3),
        },
        modelVersion: "top5-v0.1-demo",
      });
    }

    if (action === "trade_analysis") {
      const candidate = demoTop5.find((trade) => trade.id === body.candidate_id) || demoTop5[0];
      return envelope(action, requestId, {
        candidate,
        metrics: {
          score: candidate.score,
          pop: candidate.pop,
          maxProfit: candidate.maxProfit,
          maxLoss: candidate.maxLoss,
          breakevens: candidate.breakevens,
          marginRequired: candidate.maxLoss,
        },
        backtestPreview: {
          trades: 18,
          winRate: 61.1,
          profitFactor: 1.46,
          maxDrawdownPct: 6.4,
        },
        aiSuggestions: [
          "Move short strikes one step farther to reduce max loss.",
          "Reject if any leg bid-ask spread exceeds the configured liquidity filter.",
          "Use a time stop before expiry if spot touches the short strike.",
        ],
      });
    }

    if (action === "option_screener_query") {
      return envelope(action, requestId, {
        filters: body.filters || {},
        resultCount: demoScreenerResults.length,
        results: demoScreenerResults,
        dataVersion: "demo-v0.1",
      });
    }

    if (action === "option_screener_save") {
      if (supabase) {
        await supabase.from("fno_screener_definitions").insert({
          user_id: body.user_id || null,
          name: body.name || "Demo screener",
          source_type: body.source_type || "manual",
          filters: body.filters || {},
          sort_rules: body.sort_rules || [],
          is_saved: true,
        });
      }
      return envelope(action, requestId, { persisted: Boolean(supabase), saved: true });
    }

    if (
      action === "chat_message" ||
      action === "ai_ask" ||
      action === "ai_create_trade" ||
      action === "ai_create_algo_strategy" ||
      action === "ai_create_screener"
    ) {
      if (action === "ai_ask") {
        try {
          const askPayload = await callAskAiWorkflow(body as Record<string, unknown>, requestId);
          return envelope(action, requestId, askPayload);
        } catch (error) {
          console.warn(
            "Ask AI workflow fallback:",
            error instanceof Error ? error.message : String(error),
          );
        }
      }

      const mode =
        action === "ai_ask"
          ? "ask_ai"
          : action === "ai_create_algo_strategy"
            ? "create_algo_strategy"
            : action === "ai_create_screener"
              ? "option_screener"
              : "create_trade";
      const artifactType =
        mode === "ask_ai"
          ? "answer"
          : mode === "create_algo_strategy"
            ? "algo_strategy"
            : mode === "option_screener"
              ? "screener"
              : "trade";
      return envelope(action, requestId, {
        state: "waiting_input",
        assistant_message:
          action === "ai_ask"
            ? "I will explain the selected metric in plain language, show why it matters, and suggest the next safe action."
            : "Tell me your view, max loss, entry trigger, exit rule, and filters. I will return a validated educational artifact.",
        missing_inputs: [
          "view",
          "max_loss",
          "entry_rule",
          "exit_rule",
          "filters",
        ],
        artifact: {
          type: artifactType,
          title:
            artifactType === "algo_strategy"
              ? "Draft algo strategy"
              : artifactType === "screener"
                ? "Draft option screener"
                : artifactType === "answer"
                  ? "Contextual explanation"
                  : "Draft trade",
          status: artifactType === "answer" ? "ready" : "needs_input",
        },
      });
    }

    if (action === "compile_algo_form") {
      return envelope(action, requestId, {
        form: {
          runName: body.runName || "NIFTY AI Range Algo",
          instrument: body.instrument || "NIFTY",
          indicators: ["Current Candle", "SMA 9", "RSI 14", "Open Interest"],
          entryConditions: ["Current Close is above SMA", "OI change confirms selected side"],
          exitConditions: ["Target reached", "Stop loss hit", "15:10 time stop"],
          legs: demoTop5[0].legs,
          expiry: "Current Week",
        },
        validation: { valid: true, flags: ["educational_only", "paper_trade_only"] },
      });
    }

    if (action === "validate_trade" || action === "validate_algo_strategy") {
      return envelope(action, requestId, {
        valid: true,
        flags: [
          { severity: "info", code: "DEMO_DATA", label: "Using deterministic demo data" },
          { severity: "info", code: "EDUCATIONAL_ONLY", label: "Live execution blocked" },
        ],
      });
    }

    if (action === "finalize_trade" || action === "finalize_algo_strategy") {
      let persisted = false;
      if (supabase && action === "finalize_trade") {
        const { error } = await supabase.from("fno_user_trades").insert({
          user_id: body.user_id || null,
          source_type: body.source_type || "ai_or_platform",
          title: body.title || "Demo FnO trade",
          strategy_name: body.strategy_name || "Defined-risk options trade",
          legs: body.legs || demoTop5[0].legs,
          filters: body.filters || [],
          entry_rules: body.entry_rules || [],
          exit_rules: body.exit_rules || [],
          risk_rules: body.risk_rules || [],
          assumptions: body.assumptions || { mode: "demo" },
          max_profit: body.max_profit ?? demoTop5[0].maxProfit,
          max_loss: body.max_loss ?? demoTop5[0].maxLoss,
          pop: body.pop ?? demoTop5[0].pop,
          analysis_payload: body.analysis_payload || {},
          data_mode: "demo",
        });
        persisted = !error;
      }

      if (supabase && action === "finalize_algo_strategy") {
        const { error } = await supabase.from("fno_algo_strategies").insert({
          user_id: body.user_id || null,
          name: body.name || "Demo FnO algo strategy",
          universe: body.universe || { symbols: ["NIFTY"] },
          filters: body.filters || [],
          entry_rules: body.entry_rules || [],
          exit_rules: body.exit_rules || [],
          risk_rules: body.risk_rules || [],
          backtest_plan: body.backtest_plan || { mode: "demo" },
          paper_trade_plan: body.paper_trade_plan || { enabled: true },
          raw_ai_spec: body.raw_ai_spec || {},
          validated_spec: body.validated_spec || {},
          validation_flags: body.validation_flags || [],
          data_mode: "demo",
        });
        persisted = !error;
      }

      return envelope(action, requestId, {
        accepted: true,
        persisted,
        validation: {
          maxLossRequired: true,
          educationalOnly: true,
          liveExecutionBlocked: true,
        },
      });
    }

    if (action === "backtest" || action === "backtest_trade" || action === "backtest_algo_strategy") {
      return envelope(action, requestId, {
        state: "completed",
        summary: {
          totalTrades: 12,
          winRate: 58.3,
          maxDrawdownPct: 6.8,
          profitFactor: 1.42,
          dataVersion: "demo-v0.1",
          expectancy: 0.34,
          avgHoldingMinutes: 87,
        },
        equityCurve: [
          { date: "2026-05-01", value: 100000 },
          { date: "2026-05-08", value: 101850 },
          { date: "2026-05-15", value: 100920 },
          { date: "2026-05-22", value: 103420 },
        ],
      });
    }

    if (action.startsWith("paper_trade")) {
      return envelope(action, requestId, {
        state: action === "paper_trade_close" ? "paper_closed" : "paper_open",
        latestMark: {
          pnl: 0,
          note: "Demo mode mark-to-market placeholder",
        },
      });
    }

    if (action === "upstox_auth_exchange") {
      // Mock logic to exchange code for token via edge function
      // Real implementation would securely call Upstox OAuth API
      return envelope(action, requestId, {
        access_token: "mock_upstox_token_12345",
        status: "success",
      });
    }

    if (action === "upstox_fetch_live") {
      try {
        const live = await resolveLiveMarketBundle(
          String(body.instrument || body.symbol || "NIFTY"),
          body.expiry ? String(body.expiry) : undefined,
        );
        return envelope(action, requestId, {
          source: live.source,
          mode: live.mode,
          marketStatus: live.marketStatus,
          expiry: live.expiry,
          instrument: live.instrument,
          optionChain: live.optionChain,
          overview: live.overview,
        });
      } catch (error) {
        return errorEnvelope(
          action,
          requestId,
          "UPSTOX_FETCH_FAILED",
          error instanceof Error ? error.message : String(error),
          502,
        );
      }
    }

    return errorEnvelope(
      action,
      requestId,
      "NOT_IMPLEMENTED",
      "Action was recognized but not implemented",
      501,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return errorEnvelope("unknown", requestId, "INTERNAL_ERROR", message, 500);
  }
});
