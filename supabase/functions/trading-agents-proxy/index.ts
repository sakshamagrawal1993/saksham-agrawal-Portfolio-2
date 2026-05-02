import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0'
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

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
      return new Response(
        JSON.stringify({ error: `Invalid ticker format: ${ticker}` }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }
    
    // Also validate 'tickers' if action is recon
    if (action === 'recon' && body.tickers) {
      const tickersArray = body.tickers.split(',');
      for (const t of tickersArray) {
        if (!safeTickerRegex.test(t)) {
          return new Response(
            JSON.stringify({ error: `Invalid ticker format in batch: ${t}` }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
          );
        }
      }
    }

    if (action === 'get_finnhub_token') {
      const token = Deno.env.get('FINNHUB_API_KEY');
      if (!token) {
        return new Response(
          JSON.stringify({ error: 'Finnhub API key not configured in Edge Function secrets.' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
        );
      }
      return new Response(
        JSON.stringify({ token }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      );
    }

    if (action === 'batch_quote') {
      const symbols: string = body.symbols || '';
      if (!symbols) {
        return new Response(JSON.stringify({ error: 'symbols required', quotes: [] }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 });
      }

      const symbolList = symbols.split(',').map((s: string) => s.trim()).filter(Boolean).slice(0, 25);
      const isIndianMarket = symbolList[0]?.endsWith('.NS') || symbolList[0]?.endsWith('.BO');
      const twelveDataKey = Deno.env.get('TWELVEDATA_API_KEY');
      const finnhubKey = Deno.env.get('FINNHUB_API_KEY');

      // ─── Tier 1: TwelveData (up to 8 symbols, US + Indian) ──────────────────
      if (twelveDataKey) {
        try {
          const batch = symbolList.slice(0, 8).map(s => {
            const isIndian = s.endsWith('.NS') || s.endsWith('.BO');
            return isIndian ? s.replace('.NS', '').replace('.BO', '') + ':NSE' : s;
          }).join(',');
          const tdRes = await fetch(`https://api.twelvedata.com/price?symbol=${encodeURIComponent(batch)}&apikey=${twelveDataKey}`);
          const tdData = await tdRes.json();
          const quotes: { symbol: string; price: number; isRest: boolean }[] = [];

          if (tdData && !tdData.code && typeof tdData === 'object') {
            const batchList = symbolList.slice(0, 8);
            if (batchList.length === 1) {
              if (tdData.price) quotes.push({ symbol: batchList[0], price: parseFloat(tdData.price), isRest: true });
            } else {
              for (let i = 0; i < batchList.length; i++) {
                const key = Object.keys(tdData)[i];
                const entry = key ? tdData[key] : null;
                if (entry?.price && !entry.code) quotes.push({ symbol: batchList[i], price: parseFloat(entry.price), isRest: true });
              }
            }
          }

          if (quotes.length > 0) {
            return new Response(JSON.stringify({ quotes }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 });
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
            return new Response(JSON.stringify({ quotes }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 });
          }
        } catch (e) {
          console.error('Finnhub REST batch failed:', e);
        }
      }

      // ─── Tier 3: Yahoo Finance PUBLIC API (no key) — US + Indian .NS ─────────
      try {
        const batchList = symbolList.slice(0, 20);
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
          return new Response(JSON.stringify({ quotes }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 });
        }
      } catch (e) {
        console.error('Yahoo public API failed:', e);
      }

      return new Response(JSON.stringify({ quotes: [] }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 });
    }


    if (action === 'evaluate') {
      const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
      const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
      const supabase = createClient(supabaseUrl, supabaseKey);
      
      const { data: unevaluated, error: fetchErr } = await supabase
        .from('trading_sessions')
        .select('*')
        .eq('status', 'running') // Actually, they should be 'completed' but let's just evaluate everything not evaluated
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
                     .select('message')
                     .eq('session_id', session.id)
                     .eq('agent', 'Portfolio Manager')
                     .limit(1);
                   
                   const thesis = logs?.[0]?.message || "No specific thesis recorded.";
                   
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

      return new Response(
        JSON.stringify({ success: true, evaluated: evaluatedCount }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      );
    }

    if (!ticker && action !== 'recon') {
      return new Response(
        JSON.stringify({ error: 'Ticker is required' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      )
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
            return new Response(JSON.stringify({
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
            }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 });
          }
        }
        
        return new Response(JSON.stringify({ error: 'No research data found' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 });
      } catch (e) {
        return new Response(JSON.stringify({ error: e.message }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 });
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
             return new Response(
                JSON.stringify({
                  ticker: ticker,
                  price: parseFloat(tdData.close),
                  currency: tdData.currency,
                  previousClose: parseFloat(tdData.previous_close),
                  change: parseFloat(tdData.change),
                  changePercent: parseFloat(tdData.percent_change)
                }),
                { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
             );
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
            return new Response(
              JSON.stringify({
                ticker: meta.symbol,
                price: meta.regularMarketPrice,
                currency: meta.currency,
                previousClose: meta.chartPreviousClose,
                change: meta.regularMarketPrice - meta.chartPreviousClose,
                changePercent: ((meta.regularMarketPrice - meta.chartPreviousClose) / meta.chartPreviousClose) * 100
              }),
              { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
            );
          }
        }
      }

      return new Response(
        JSON.stringify({ error: 'Failed to fetch quote from all available providers.' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
      );
    }

    // Default action: Trigger n8n
    const n8nWebhookUrl = Deno.env.get('N8N_WEBHOOK_URL')
    
    if (!n8nWebhookUrl) {
       console.error("N8N_WEBHOOK_URL is not set");
       return new Response(
        JSON.stringify({ error: 'Internal Server Error: Missing N8N config' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
      )
    }

    console.log(`Proxying request for ${ticker} to n8n...`);

    // Call the n8n Webhook
    const n8nResponse = await fetch(n8nWebhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        action,
        ticker,
        tickers: body.tickers,
        session_id,
        date: date || new Date().toISOString().split('T')[0]
      }),
    })

    if (!n8nResponse.ok) {
        console.error(`n8n responded with status ${n8nResponse.status}`);
        return new Response(
            JSON.stringify({ error: 'Failed to process trading agent workflow' }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 502 }
        )
    }

    const result = await n8nResponse.json()
    
    // For recon action, we expect { opportunities: [...] }
    if (action === 'recon' && Array.isArray(result.opportunities)) {
       return new Response(
         JSON.stringify(result),
         { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
       )
    }

    return new Response(
      JSON.stringify(result),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    )
  } catch (error) {
    console.error('Error proxying to n8n:', error.message)
    return new Response(
      JSON.stringify({ error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    )
  }
})
