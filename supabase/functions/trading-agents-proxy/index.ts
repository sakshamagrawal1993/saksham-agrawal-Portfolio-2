import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-trading-agents-admin-token',
}

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
    thesis: decision.thesis || result.executive_summary || ''
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
      const n8nSecret = Deno.env.get('N8N_WEBHOOK_SECRET');
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
          const quotes: { symbol: string; price: number; isRest: boolean }[] = [];
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
          const quotes: { symbol: string; price: number; isRest: boolean }[] = [];
          await Promise.allSettled(symbolList.slice(0, 10).map(async (sym) => {
            const r = await fetch(`https://finnhub.io/api/v1/quote?symbol=${sym}&token=${finnhubKey}`);
            const d = await r.json();
            // Finnhub returns { c: currentPrice, pc: prevClose, ... }; c=0 means no data
            if (d?.c && d.c > 0) quotes.push({ symbol: sym, price: d.c, isRest: true });
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
        const quotes: { symbol: string; price: number; isRest: boolean }[] = [];

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
                const price = d?.chart?.result?.[0]?.meta?.regularMarketPrice;
                if (price) quotes.push({ symbol: sym, price, isRest: true });
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
              .forEach((q: any) => quotes.push({ symbol: q.symbol, price: q.regularMarketPrice, isRest: true }));
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
      
      const { data: unevaluated, error: fetchErr } = await supabase
        .from('trading_sessions')
        .select('*')
        .eq('status', 'completed')
        .eq('evaluated', false)
        .lt('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()); // Older than 24 hours
        
      if (fetchErr) throw fetchErr;

      // Real evaluation logic
      let evaluatedCount = 0;
      for (const session of unevaluated || []) {
         try {
           const entryPrice = parseFloat(session.execution_price);
           if (!entryPrice) {
             // If no entry price was recorded, we can't evaluate accurately
             await supabase.from('trading_sessions').update({ evaluated: true, outcome: 'INVALID' }).eq('id', session.id);
             continue;
           }

           const startTime = Math.floor(new Date(session.created_at).getTime() / 1000);
           const endTime = startTime + (24 * 60 * 60); // 24 hours later
           
           // Fetch price at 24h mark (or closest following price)
           // We ask for a small window around the 24h mark
           const yhUrl = `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(session.ticker)}?period1=${endTime}&period2=${endTime + 86400}&interval=1h`;
           const yhRes = await fetch(yhUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } });
           
           if (yhRes.ok) {
             const yhData = await yhRes.json();
             const result = yhData?.chart?.result?.[0];
             const timestamps = result?.timestamp || [];
             const prices = result?.indicators?.quote?.[0]?.close || [];
             
             let exitPrice = null;
             if (prices.length > 0) {
               // Get the first available price at or after the 24h mark
               exitPrice = prices.find((p: any) => p !== null);
             }

             if (exitPrice) {
               const win = exitPrice > entryPrice;
               const outcome = win ? 'WIN' : 'LOSS';
               
               await supabase.from('trading_sessions').update({ 
                 evaluated: true, 
                 outcome: outcome 
               }).eq('id', session.id);

               // ─── Generate Agent Lesson (The RL Loop) ─────────────────────
               const openaiKey = Deno.env.get('OPENAI_API_KEY');
               if (openaiKey) {
                 try {
                   // Fetch the portfolio manager's decision/thesis from logs
                   const { data: logs } = await supabase
                     .from('trading_logs')
                     .select('content')
                     .eq('session_id', session.id)
                     .eq('agent_role', 'Portfolio Manager')
                     .eq('log_type', 'decision')
                     .limit(1);
                   
                   const thesis = logs?.[0]?.content || session.investment_thesis || "No specific thesis recorded.";
                   
                   const lessonRes = await fetch('https://api.openai.com/v1/chat/completions', {
                     method: 'POST',
                     headers: {
                       'Authorization': `Bearer ${openaiKey}`,
                       'Content-Type': 'application/json'
                     },
                     body: JSON.stringify({
                       model: 'gpt-4o-mini',
                       messages: [
                         { role: 'system', content: 'You are a Trading Mentor. Compare a predicted trading thesis with the actual 24-hour outcome and provide a single, punchy lesson (max 20 words) for the agent to improve.' },
                         { role: 'user', content: `Ticker: ${session.ticker}\nOutcome: ${outcome} (Entry: ${entryPrice}, Exit: ${exitPrice})\nPredicted Thesis: ${thesis}` }
                       ],
                       max_tokens: 50
                     })
                   });
                   
                   if (lessonRes.ok) {
                     const lessonData = await lessonRes.json();
                     const lesson = lessonData.choices[0].message.content;
                     await supabase.from('agent_lessons').insert({
                       session_id: session.id,
                       ticker: session.ticker,
                       lesson: lesson.trim()
                     });
                   }
                 } catch (e) {
                   console.error('Failed to generate lesson:', e);
                 }
               }

               evaluatedCount++;
             }
           }
         } catch (e) {
           console.error(`Evaluation failed for session ${session.id}:`, e);
         }
      }

      return jsonResponse({ success: true, evaluated: evaluatedCount });
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

      return jsonResponse({ error: 'Failed to fetch quote from all available providers.' }, 500);
    }

    // Default action: Trigger n8n
    const n8nWebhookUrl = action === 'recon'
      ? Deno.env.get('N8N_RECON_WEBHOOK_URL') || Deno.env.get('N8N_WEBHOOK_URL')
      : Deno.env.get('N8N_WEBHOOK_URL')
    
    if (!n8nWebhookUrl) {
       console.error("N8N_WEBHOOK_URL is not set");
       return jsonResponse({ error: 'Internal Server Error: Missing N8N config' }, 500)
    }

    const supabase = action === 'run' ? getServiceClient() : null;
    if (action === 'run' && supabase && session_id) {
      const { error: sessionErr } = await supabase.from('trading_sessions').upsert({
        id: session_id,
        ticker,
        status: 'running',
        execution_price: body.execution_price ?? null,
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
    const n8nSecret = Deno.env.get('N8N_WEBHOOK_SECRET');
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
