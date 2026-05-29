const UPSTOX_API_BASE = "https://api.upstox.com/v2";

const INSTRUMENT_KEYS: Record<string, string> = {
  NIFTY: "NSE_INDEX|Nifty 50",
  BANKNIFTY: "NSE_INDEX|Nifty Bank",
  FINNIFTY: "NSE_INDEX|Nifty Fin Service",
  MIDCPNIFTY: "NSE_INDEX|NIFTY MID SELECT",
  NIFTYNEXT50: "NSE_INDEX|Nifty Next 50",
};

const INSTRUMENT_META: Record<string, { name: string; lotSize: number }> = {
  NIFTY: { name: "Nifty 50 Index Options", lotSize: 65 },
  BANKNIFTY: { name: "Nifty Bank Index Options", lotSize: 30 },
  FINNIFTY: { name: "Nifty Financial Services Index Options", lotSize: 65 },
  MIDCPNIFTY: { name: "Nifty Midcap Select Index Options", lotSize: 120 },
  NIFTYNEXT50: { name: "Nifty Next 50 Index Options", lotSize: 25 },
};

const instrumentKeyCache = new Map<string, string>();

type UpstoxChainRow = {
  strike_price?: number;
  underlying_spot_price?: number;
  call_options?: Record<string, unknown>;
  put_options?: Record<string, unknown>;
};

export type LiveMarketBundle = {
  mode: "upstox_live";
  source: "upstox_analytics";
  marketStatus: string;
  expiry: string;
  instrument: Record<string, unknown>;
  optionChain: Record<string, unknown>[];
  overview: Record<string, unknown>;
  marketInformation?: Record<string, unknown>;
};

export const getUpstoxAnalyticsToken = () =>
  Deno.env.get("UPSTOX_ANALYTICS_TOKEN") ||
  Deno.env.get("UPSTOX_ACCESS_TOKEN") ||
  "";

const normalizeIv = (raw: unknown) => {
  const value = Number(raw ?? 0.15);
  if (!Number.isFinite(value) || value <= 0) return 0.15;
  return value > 3 ? value / 100 : value;
};

const quoteFromLeg = (
  strike: number,
  type: "CE" | "PE",
  leg: Record<string, unknown>,
  quoteTs: string,
) => {
  const market = (leg.market_data as Record<string, unknown> | undefined) ?? {};
  const greeks = (leg.option_greeks as Record<string, unknown> | undefined) ?? {};
  const oi = Number(market.oi ?? 0);
  const prevOi = Number(market.prev_oi ?? 0);
  const bid = Number(market.bid_price ?? 0);
  const ask = Number(market.ask_price ?? 0);
  const ltp = Number(market.ltp ?? market.close_price ?? 0);

  return {
    strike,
    type,
    bid,
    bidQuantity: Number(market.bid_qty ?? 0),
    ask,
    askQuantity: Number(market.ask_qty ?? 0),
    ltp,
    volume: Number(market.volume ?? 0),
    oi,
    oiChange: oi - prevOi,
    totalBuyQuantity: Number(market.bid_qty ?? 0),
    totalSellQuantity: Number(market.ask_qty ?? 0),
    iv: normalizeIv(greeks.iv),
    delta: Number(greeks.delta ?? 0),
    gamma: Number(greeks.gamma ?? 0),
    theta: Number(greeks.theta ?? 0),
    vega: Number(greeks.vega ?? 0),
    rho: 0,
    quoteTs,
  };
};

const upstoxGet = async (token: string, path: string, params?: Record<string, string>) => {
  const query = params ? `?${new URLSearchParams(params).toString()}` : "";
  const response = await fetch(`${UPSTOX_API_BASE}${path}${query}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
    },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.status !== "success") {
    throw new Error(
      `Upstox request failed (${response.status}): ${JSON.stringify(payload).slice(0, 300)}`,
    );
  }
  return payload;
};

const scoreInstrumentMatch = (symbol: string, row: Record<string, unknown>) => {
  const normalized = symbol.toUpperCase();
  const tradingSymbol = String(row.trading_symbol ?? row.tradingsymbol ?? "").toUpperCase();
  const shortName = String(row.short_name ?? "").toUpperCase();
  const symbolValue = String(row.symbol ?? row.underlying_symbol ?? "").toUpperCase();
  const segment = String(row.segment ?? "").toUpperCase();
  const instrumentType = String(row.instrument_type ?? "").toUpperCase();
  let score = 0;
  if (tradingSymbol === normalized) score += 100;
  if (symbolValue === normalized) score += 90;
  if (shortName === normalized) score += 60;
  if (segment === "NSE_EQ") score += 30;
  if (instrumentType === "EQ" || instrumentType === "EQUITY") score += 20;
  if (row.instrument_key) score += 10;
  return score;
};

const searchInstruments = async (
  token: string,
  query: string,
  params: Record<string, string>,
) => {
  const payload = await upstoxGet(token, "/instruments/search", { query, ...params });
  return Array.isArray(payload.data) ? payload.data as Array<Record<string, unknown>> : [];
};

const resolveInstrumentKey = async (token: string, symbol: string) => {
  const normalized = symbol.toUpperCase();
  const staticKey = INSTRUMENT_KEYS[normalized];
  if (staticKey) return staticKey;
  const cached = instrumentKeyCache.get(normalized);
  if (cached) return cached;

  const eqMatches = await searchInstruments(token, normalized, {
    exchanges: "NSE",
    segments: "EQ",
  });
  const sorted = eqMatches.sort((a, b) => scoreInstrumentMatch(normalized, b) - scoreInstrumentMatch(normalized, a));
  if (sorted.length && scoreInstrumentMatch(normalized, sorted[0]) > 0) {
    const resolved = String(sorted[0].instrument_key ?? "");
    if (resolved) {
      instrumentKeyCache.set(normalized, resolved);
      return resolved;
    }
  }

  const foMatches = await searchInstruments(token, normalized, {
    exchanges: "NSE",
    segments: "FO",
  });
  const futureMatch = foMatches.find((row) =>
    String(row.underlying_symbol ?? "").toUpperCase() === normalized && row.underlying_key
  );
  if (futureMatch?.underlying_key) {
    const resolved = String(futureMatch.underlying_key);
    instrumentKeyCache.set(normalized, resolved);
    return resolved;
  }

  throw new Error(`Unsupported symbol: ${symbol}`);
};

const optionalUpstoxGet = async (
  token: string,
  path: string,
  params?: Record<string, string>,
) => {
  try {
    const payload = await upstoxGet(token, path, params);
    return { ok: true as const, data: payload.data };
  } catch (error) {
    return {
      ok: false as const,
      error: error instanceof Error ? error.message : String(error),
    };
  }
};

const fetchMarketInformation = async (
  token: string,
  instrumentKey: string,
  expiry: string,
) => {
  const date = new Date().toISOString().slice(0, 10);
  const [pcr, maxPain, oi, changeOi, fii, dii] = await Promise.all([
    optionalUpstoxGet(token, "/market/pcr", {
      instrument_key: instrumentKey,
      expiry,
      date,
      bucket_interval: "60",
    }),
    optionalUpstoxGet(token, "/market/max-pain", {
      instrument_key: instrumentKey,
      expiry,
      date,
      bucket_interval: "60",
    }),
    optionalUpstoxGet(token, "/market/oi", {
      instrument_key: instrumentKey,
      expiry,
      date,
    }),
    optionalUpstoxGet(token, "/market/change-oi", {
      instrument_key: instrumentKey,
      expiry,
      date,
      interval: "1",
    }),
    optionalUpstoxGet(token, "/market/fii", {
      data_type: "NSE_FO|INDEX_FUTURES,NSE_FO|INDEX_OPTIONS,NSE_EQ|CASH",
      interval: "1D",
    }),
    optionalUpstoxGet(token, "/market/dii", {
      data_type: "NSE_EQ|CASH",
      interval: "1D",
    }),
  ]);

  return {
    asOfDate: date,
    pcr,
    maxPain,
    oi,
    changeOi,
    fii,
    dii,
  };
};

const applyOfficialMarketInformation = (
  chainAnalytics: Record<string, unknown>,
  marketInformation: Record<string, unknown>,
) => {
  const pcrResult = marketInformation.pcr as { ok?: boolean; data?: Record<string, unknown> };
  const maxPainResult = marketInformation.maxPain as { ok?: boolean; data?: Record<string, unknown> };
  const oiResult = marketInformation.oi as { ok?: boolean; data?: Record<string, unknown> };

  if (pcrResult?.ok && Number.isFinite(Number(pcrResult.data?.pcr))) {
    chainAnalytics.pcrOi = Number(Number(pcrResult.data?.pcr).toFixed(2));
  }
  if (maxPainResult?.ok && Number.isFinite(Number(maxPainResult.data?.max_pain))) {
    chainAnalytics.maxPain = Number(maxPainResult.data?.max_pain);
  }
  if (oiResult?.ok) {
    const totalPuts = Number(oiResult.data?.total_puts ?? 0);
    const totalCalls = Number(oiResult.data?.total_calls ?? 0);
    if (totalCalls > 0) {
      chainAnalytics.pcrOi = Number((totalPuts / totalCalls).toFixed(2));
    }
  }

  return chainAnalytics;
};

const nearestExpiry = async (token: string, instrumentKey: string) => {
  const payload = await upstoxGet(token, "/option/contract", { instrument_key: instrumentKey });
  const contracts = (payload.data as Array<Record<string, unknown>>) ?? [];
  const today = new Date().toISOString().slice(0, 10);
  const expiries = [...new Set(
    contracts
      .map((row) => String(row.expiry ?? ""))
      .filter((expiry) => expiry && expiry >= today),
  )].sort();
  if (!expiries.length) throw new Error("No active expiries found");
  return expiries[0];
};

const buildOverview = (instrument: Record<string, unknown>, chainAnalytics: Record<string, unknown>) => {
  const pcr = Number(chainAnalytics.pcrOi ?? 1);
  const regime = pcr > 1.1 ? "bearish" : pcr < 0.85 ? "bullish" : "range-bound";
  const atmIv = Number(chainAnalytics.atmIv ?? 15);
  const volatilityRegime = atmIv > 22 ? "high" : atmIv < 13 ? "low" : "normal";
  return {
    instrument,
    regime,
    trendScore: 62,
    volatilityRegime,
    chain: chainAnalytics,
  };
};

const computeChainAnalytics = (
  instrument: Record<string, unknown>,
  chain: Array<Record<string, unknown>>,
) => {
  const calls = chain.filter((row) => row.type === "CE");
  const puts = chain.filter((row) => row.type === "PE");
  const totalCallOi = calls.reduce((sum, row) => sum + Number(row.oi ?? 0), 0);
  const totalPutOi = puts.reduce((sum, row) => sum + Number(row.oi ?? 0), 0);
  const totalCallVolume = calls.reduce((sum, row) => sum + Number(row.volume ?? 0), 0);
  const totalPutVolume = puts.reduce((sum, row) => sum + Number(row.volume ?? 0), 0);
  const spot = Number(instrument.spot ?? 0);
  const strikes = [...new Set(chain.map((row) => Number(row.strike)))].sort((a, b) => a - b);
  const atmStrike = strikes.reduce(
    (best, strike) => (Math.abs(strike - spot) < Math.abs(best - spot) ? strike : best),
    strikes[0] ?? spot,
  );
  const atmCall = calls.find((row) => Number(row.strike) === atmStrike);
  const atmPut = puts.find((row) => Number(row.strike) === atmStrike);
  const mid = (quote: Record<string, unknown> | undefined) => {
    const bid = Number(quote?.bid ?? 0);
    const ask = Number(quote?.ask ?? 0);
    if (bid > 0 && ask > 0) return (bid + ask) / 2;
    return Number(quote?.ltp ?? 0);
  };
  const callWall = calls.reduce((best, row) => (Number(row.oi) > Number(best.oi) ? row : best), calls[0]);
  const putWall = puts.reduce((best, row) => (Number(row.oi) > Number(best.oi) ? row : best), puts[0]);
  const atmIv = (((Number(atmCall?.iv ?? 0.15) + Number(atmPut?.iv ?? 0.17)) / 2) * 100);
  const expectedMoveStraddle = mid(atmCall) + mid(atmPut);
  const expectedMoveIv = spot * ((atmIv / 100) * Math.sqrt(2 / 365));

  return {
    pcrOi: totalCallOi ? Number((totalPutOi / totalCallOi).toFixed(2)) : 0,
    pcrVolume: totalCallVolume ? Number((totalPutVolume / totalCallVolume).toFixed(2)) : 0,
    maxPain: atmStrike,
    callWall: Number(callWall?.strike ?? atmStrike),
    putWall: Number(putWall?.strike ?? atmStrike),
    expectedMoveStraddle: Number(expectedMoveStraddle.toFixed(2)),
    expectedMoveIv: Number(expectedMoveIv.toFixed(2)),
    atmIv: Number(atmIv.toFixed(2)),
    skew: 0,
    termSlope: -1.2,
    quoteAgeSec: 0,
    liquidityScore: 82.4,
    qualityFlags: [],
  };
};

export const fetchLiveMarketBundle = async (
  symbol = "NIFTY",
  expiry?: string,
): Promise<LiveMarketBundle> => {
  const token = getUpstoxAnalyticsToken();
  if (!token) throw new Error("UPSTOX_ANALYTICS_TOKEN is not configured");

  const instrumentKey = await resolveInstrumentKey(token, symbol);

  const resolvedExpiry = expiry || await nearestExpiry(token, instrumentKey);
  const payload = await upstoxGet(token, "/option/chain", {
    instrument_key: instrumentKey,
    expiry_date: resolvedExpiry,
  });
  const rows = (payload.data as UpstoxChainRow[]) ?? [];
  if (!rows.length) throw new Error(`Empty option chain for ${symbol} @ ${resolvedExpiry}`);

  const quoteTs = new Date().toISOString();
  const spot = Number(rows[0]?.underlying_spot_price ?? 0);
  const meta = INSTRUMENT_META[symbol.toUpperCase()] ?? { name: symbol, lotSize: 1 };
  const optionChain = rows.flatMap((row) => {
    const strike = Number(row.strike_price ?? 0);
    const quotes: Record<string, unknown>[] = [];
    if (row.call_options) quotes.push(quoteFromLeg(strike, "CE", row.call_options, quoteTs));
    if (row.put_options) quotes.push(quoteFromLeg(strike, "PE", row.put_options, quoteTs));
    return quotes;
  });

  const instrument = {
    symbol: symbol.toUpperCase(),
    name: meta.name,
    lotSize: meta.lotSize,
    minimumLot: meta.lotSize,
    tickSize: 0.05,
    freezeQuantity: meta.lotSize * 27,
    expiry: resolvedExpiry,
    isWeekly: true,
    spot,
    previousClose: spot,
    snapshotTs: quoteTs,
  };

  const marketInformation = await fetchMarketInformation(token, instrumentKey, resolvedExpiry);
  const chainAnalytics = applyOfficialMarketInformation(
    computeChainAnalytics(instrument, optionChain),
    marketInformation,
  );
  const statusPayload = await upstoxGet(token, "/market/status/NSE").catch(() => ({ data: { status: "unknown" } }));
  const marketStatus = String((statusPayload.data as Record<string, unknown> | undefined)?.status ?? "unknown");

  return {
    mode: "upstox_live",
    source: "upstox_analytics",
    marketStatus,
    expiry: resolvedExpiry,
    instrument,
    optionChain,
    overview: buildOverview(instrument, chainAnalytics),
    marketInformation,
  };
};

export const fetchLiveMarketFromQuantService = async (
  baseUrl: string,
  symbol = "NIFTY",
  expiry?: string,
) => {
  const response = await fetch(`${baseUrl.replace(/\/$/, "")}/compute/chain`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ instrument: symbol, expiry, mode: "live" }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`Quant service failed (${response.status}): ${JSON.stringify(payload).slice(0, 300)}`);
  }

  const instrumentSnake = payload.instrument as Record<string, unknown>;
  const instrument = {
    symbol: instrumentSnake.symbol,
    name: instrumentSnake.name,
    lotSize: instrumentSnake.lot_size ?? instrumentSnake.lotSize,
    minimumLot: instrumentSnake.minimum_lot ?? instrumentSnake.minimumLot ?? instrumentSnake.lot_size,
    tickSize: instrumentSnake.tick_size ?? instrumentSnake.tickSize ?? 0.05,
    freezeQuantity: instrumentSnake.freeze_quantity ?? instrumentSnake.freezeQuantity ?? 0,
    expiry: instrumentSnake.expiry,
    isWeekly: instrumentSnake.is_weekly ?? instrumentSnake.isWeekly ?? true,
    spot: instrumentSnake.spot,
    previousClose: instrumentSnake.previous_close ?? instrumentSnake.previousClose,
    snapshotTs: instrumentSnake.snapshot_ts ?? instrumentSnake.snapshotTs,
  };

  const analyticsSnake = payload.analytics as Record<string, unknown>;
  const chainAnalytics = {
    pcrOi: analyticsSnake.pcr_oi ?? analyticsSnake.pcrOi,
    pcrVolume: analyticsSnake.pcr_volume ?? analyticsSnake.pcrVolume,
    maxPain: analyticsSnake.max_pain ?? analyticsSnake.maxPain,
    callWall: analyticsSnake.call_wall ?? analyticsSnake.callWall,
    putWall: analyticsSnake.put_wall ?? analyticsSnake.putWall,
    expectedMoveStraddle: analyticsSnake.expected_move_straddle ?? analyticsSnake.expectedMoveStraddle,
    expectedMoveIv: analyticsSnake.expected_move_iv ?? analyticsSnake.expectedMoveIv,
    atmIv: analyticsSnake.atm_iv ?? analyticsSnake.atmIv,
    skew: analyticsSnake.skew,
    termSlope: analyticsSnake.term_slope ?? analyticsSnake.termSlope,
    quoteAgeSec: analyticsSnake.quote_age_sec ?? analyticsSnake.quoteAgeSec ?? 0,
    liquidityScore: analyticsSnake.liquidity_score ?? analyticsSnake.liquidityScore ?? 0,
    qualityFlags: analyticsSnake.quality_flags ?? analyticsSnake.qualityFlags ?? [],
  };

  const optionChain = ((payload.chain as Array<Record<string, unknown>>) ?? []).map((row) => ({
    strike: row.strike,
    type: row.type,
    bid: row.bid,
    bidQuantity: row.bid_quantity ?? row.bidQuantity ?? 0,
    ask: row.ask,
    askQuantity: row.ask_quantity ?? row.askQuantity ?? 0,
    ltp: row.ltp,
    volume: row.volume,
    oi: row.oi,
    oiChange: row.oi_change ?? row.oiChange ?? 0,
    totalBuyQuantity: row.total_buy_quantity ?? row.totalBuyQuantity ?? 0,
    totalSellQuantity: row.total_sell_quantity ?? row.totalSellQuantity ?? 0,
    iv: row.iv,
    delta: row.delta,
    gamma: row.gamma,
    theta: row.theta,
    vega: row.vega,
    rho: row.rho ?? 0,
    quoteTs: row.quote_ts ?? row.quoteTs ?? new Date().toISOString(),
  }));

  return {
    mode: "upstox_live" as const,
    source: "upstox_analytics" as const,
    marketStatus: String(payload.market_status ?? "unknown"),
    expiry: String(payload.expiry ?? instrument.expiry),
    instrument,
    optionChain,
    overview: buildOverview(instrument, chainAnalytics),
    marketInformation: (payload.market_information ?? payload.marketInformation ?? undefined) as Record<string, unknown> | undefined,
  };
};

export const resolveLiveMarketBundle = async (symbol = "NIFTY", expiry?: string) => {
  const quantUrl = Deno.env.get("FNO_QUANT_SERVICE_URL");
  if (quantUrl) {
    try {
      const bundle = await fetchLiveMarketFromQuantService(quantUrl, symbol, expiry);
      if (bundle.marketInformation) return bundle;
      console.warn("FnO quant service returned a stale payload without marketInformation; falling back to direct Upstox");
    } catch (error) {
      console.warn(
        "FnO quant service unavailable, falling back to direct Upstox:",
        error instanceof Error ? error.message : String(error),
      );
    }
  }
  return fetchLiveMarketBundle(symbol, expiry);
};
