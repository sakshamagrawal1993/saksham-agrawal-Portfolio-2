import type { ChainAnalytics, Instrument, MarketOverview, OptionQuote } from '../types';

export type FnOLiveMarketState = {
  mode: 'demo' | 'upstox_live';
  symbol: string;
  instrument: Instrument;
  chain: OptionQuote[];
  overview?: MarketOverview;
  marketStatus?: string;
  expiry?: string;
  dataSource?: string;
  marketInformation?: Record<string, unknown>;
};

const asNumber = (value: unknown, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const asSymbol = (raw: Record<string, unknown>, fallbackSymbol: string) =>
  String(
    raw.symbol ??
    raw.tradingSymbol ??
    raw.trading_symbol ??
    raw.underlyingSymbol ??
    raw.underlying_symbol ??
    fallbackSymbol
  ).toUpperCase();

export const parseInstrument = (raw: Record<string, unknown>, fallbackSymbol = 'NIFTY'): Instrument => ({
  symbol: asSymbol(raw, fallbackSymbol),
  name: String(raw.name ?? raw.symbol ?? raw.tradingSymbol ?? raw.trading_symbol ?? fallbackSymbol),
  lotSize: asNumber(raw.lotSize ?? raw.lot_size, 1),
  minimumLot: asNumber(raw.minimumLot ?? raw.minimum_lot ?? raw.lotSize ?? raw.lot_size, 1),
  tickSize: asNumber(raw.tickSize ?? raw.tick_size, 0.05),
  freezeQuantity: asNumber(raw.freezeQuantity ?? raw.freeze_quantity, 0),
  expiry: String(raw.expiry ?? ''),
  isWeekly: Boolean(raw.isWeekly ?? raw.is_weekly ?? true),
  spot: asNumber(raw.spot ?? raw.underlyingSpotPrice ?? raw.underlying_spot_price),
  previousClose: asNumber(raw.previousClose ?? raw.previous_close ?? raw.spot ?? raw.underlyingSpotPrice ?? raw.underlying_spot_price),
  snapshotTs: String(raw.snapshotTs ?? raw.snapshot_ts ?? new Date().toISOString()),
});

export const parseOptionChain = (rows: Array<Record<string, unknown>>): OptionQuote[] =>
  rows.map((row) => ({
    strike: asNumber(row.strike),
    type: (row.type === 'PE' ? 'PE' : 'CE') as OptionQuote['type'],
    bid: asNumber(row.bid),
    bidQuantity: asNumber(row.bidQuantity ?? row.bid_quantity),
    ask: asNumber(row.ask),
    askQuantity: asNumber(row.askQuantity ?? row.ask_quantity),
    ltp: asNumber(row.ltp),
    volume: asNumber(row.volume),
    oi: asNumber(row.oi),
    oiChange: asNumber(row.oiChange ?? row.oi_change),
    totalBuyQuantity: asNumber(row.totalBuyQuantity ?? row.total_buy_quantity),
    totalSellQuantity: asNumber(row.totalSellQuantity ?? row.total_sell_quantity),
    iv: asNumber(row.iv, 0.15),
    delta: asNumber(row.delta),
    gamma: asNumber(row.gamma),
    theta: asNumber(row.theta),
    vega: asNumber(row.vega),
    rho: asNumber(row.rho),
    quoteTs: String(row.quoteTs ?? row.quote_ts ?? new Date().toISOString()),
  }));

export const parseChainAnalytics = (raw: Record<string, unknown>): ChainAnalytics => ({
  pcrOi: asNumber(raw.pcrOi ?? raw.pcr_oi, 1),
  pcrVolume: asNumber(raw.pcrVolume ?? raw.pcr_volume, 1),
  maxPain: asNumber(raw.maxPain ?? raw.max_pain),
  callWall: asNumber(raw.callWall ?? raw.call_wall),
  putWall: asNumber(raw.putWall ?? raw.put_wall),
  expectedMoveStraddle: asNumber(raw.expectedMoveStraddle ?? raw.expected_move_straddle),
  expectedMoveIv: asNumber(raw.expectedMoveIv ?? raw.expected_move_iv),
  atmIv: asNumber(raw.atmIv ?? raw.atm_iv),
  skew: asNumber(raw.skew),
  termSlope: asNumber(raw.termSlope ?? raw.term_slope),
  quoteAgeSec: asNumber(raw.quoteAgeSec ?? raw.quote_age_sec),
  liquidityScore: asNumber(raw.liquidityScore ?? raw.liquidity_score),
  qualityFlags: Array.isArray(raw.qualityFlags ?? raw.quality_flags)
    ? (raw.qualityFlags ?? raw.quality_flags) as ChainAnalytics['qualityFlags']
    : [],
});

export const parseLiveMarketBootstrap = (data: Record<string, unknown>, fallbackSymbol = 'NIFTY'): FnOLiveMarketState | null => {
  if (data.mode !== 'upstox_live') return null;
  const overviewRaw = data.overview as Record<string, unknown> | undefined;
  const instrumentsRaw = data.instruments as Array<Record<string, unknown>> | undefined;
  const instrumentRaw =
    (data.instrument as Record<string, unknown> | undefined) ??
    instrumentsRaw?.[0] ??
    (overviewRaw?.instrument as Record<string, unknown> | undefined);
  const chainRaw = data.optionChain as Array<Record<string, unknown>> | undefined;
  if (!instrumentRaw || !chainRaw?.length) return null;

  const instrument = parseInstrument(instrumentRaw, fallbackSymbol);
  const chain = parseOptionChain(chainRaw);
  const chainAnalyticsRaw = (overviewRaw?.chain as Record<string, unknown> | undefined) ?? {};

  const overview: MarketOverview | undefined = overviewRaw
    ? {
        instrument,
        regime: (overviewRaw.regime as MarketOverview['regime']) ?? 'range-bound',
        trendScore: asNumber(overviewRaw.trendScore ?? overviewRaw.trend_score, 62),
        volatilityRegime: (overviewRaw.volatilityRegime ?? overviewRaw.volatility_regime ?? 'normal') as MarketOverview['volatilityRegime'],
        chain: parseChainAnalytics(chainAnalyticsRaw),
      }
    : undefined;

  return {
    mode: 'upstox_live',
    symbol: instrument.symbol,
    instrument,
    chain,
    overview,
    marketStatus: data.marketStatus ? String(data.marketStatus) : undefined,
    expiry: data.expiry ? String(data.expiry) : instrument.expiry,
    dataSource: data.dataSource ? String(data.dataSource) : 'upstox_analytics',
    marketInformation: data.marketInformation as Record<string, unknown> | undefined,
  };
};
