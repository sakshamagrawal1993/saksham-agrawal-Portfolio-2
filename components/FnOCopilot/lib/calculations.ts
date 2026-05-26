import { CandidateTrade, ChainAnalytics, Instrument, OptionLeg, OptionQuote, QualityFlag, ScoreBreakdown } from '../types';

export const round = (value: number, decimals = 2) => {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
};

export const mid = (quote: Pick<OptionQuote, 'bid' | 'ask' | 'ltp'>) => {
  if (quote.bid > 0 && quote.ask > 0) return round((quote.bid + quote.ask) / 2, 2);
  return quote.ltp;
};

export const spreadPct = (quote: Pick<OptionQuote, 'bid' | 'ask' | 'ltp'>) => {
  const m = mid(quote);
  return m <= 0 ? 1 : (quote.ask - quote.bid) / m;
};

export const quoteAgeSec = (quoteTs: string, now = new Date('2024-09-25T14:10:15+05:30')) =>
  Math.max(0, Math.round((now.getTime() - new Date(quoteTs).getTime()) / 1000));

export const getQuote = (chain: OptionQuote[], strike: number, type: 'CE' | 'PE') =>
  chain.find((q) => q.strike === strike && q.type === type);

export const getAtmStrike = (chain: OptionQuote[], spot: number) => {
  const strikes = [...new Set(chain.map((q) => q.strike))].sort((a, b) => a - b);
  return strikes.reduce((closest, strike) => (Math.abs(strike - spot) < Math.abs(closest - spot) ? strike : closest), strikes[0]);
};

export const nearestStrike = (chain: OptionQuote[], target: number) => {
  const strikes = [...new Set(chain.map((q) => q.strike))].sort((a, b) => a - b);
  return strikes.reduce((closest, strike) => (Math.abs(strike - target) < Math.abs(closest - target) ? strike : closest), strikes[0]);
};

export const computeMaxPain = (chain: OptionQuote[]) => {
  const strikes = [...new Set(chain.map((q) => q.strike))].sort((a, b) => a - b);
  let bestStrike = strikes[0];
  let lowestPayout = Number.POSITIVE_INFINITY;

  for (const settlement of strikes) {
    const payout = chain.reduce((sum, q) => {
      const intrinsic = q.type === 'CE' ? Math.max(0, settlement - q.strike) : Math.max(0, q.strike - settlement);
      return sum + intrinsic * q.oi;
    }, 0);
    if (payout < lowestPayout) {
      lowestPayout = payout;
      bestStrike = settlement;
    }
  }

  return bestStrike;
};

export const liquidityScoreForQuote = (quote: OptionQuote) => {
  const spreadScore = Math.max(0, 100 - spreadPct(quote) * 900);
  const oiScore = Math.min(100, (quote.oi / 400000) * 100);
  const volumeScore = Math.min(100, (quote.volume / 100000) * 100);
  const freshnessScore = Math.max(0, 100 - quoteAgeSec(quote.quoteTs) * 2);
  return round(0.35 * spreadScore + 0.25 * oiScore + 0.2 * volumeScore + 0.2 * freshnessScore, 1);
};

export const qualityFlagsForQuotes = (quotes: OptionQuote[]): QualityFlag[] => {
  const flags: QualityFlag[] = [];
  if (quotes.some((q) => quoteAgeSec(q.quoteTs) > 60)) {
    flags.push({ severity: 'critical', code: 'STALE_QUOTES', label: 'Quote age exceeds freshness threshold' });
  }
  if (quotes.some((q) => spreadPct(q) > 0.08)) {
    flags.push({ severity: 'warning', code: 'WIDE_SPREAD', label: 'One or more legs have wide bid-ask spread' });
  }
  if (quotes.some((q) => q.oi < 50000)) {
    flags.push({ severity: 'warning', code: 'LOW_OI', label: 'One or more legs have low open interest' });
  }
  if (quotes.some((q) => q.bid <= 0 || q.ask <= 0)) {
    flags.push({ severity: 'critical', code: 'MISSING_BID_ASK', label: 'Missing bid or ask on a required leg' });
  }
  return flags;
};

export const computeChainAnalytics = (instrument: Instrument, chain: OptionQuote[]): ChainAnalytics => {
  const calls = chain.filter((q) => q.type === 'CE');
  const puts = chain.filter((q) => q.type === 'PE');
  const totalCallOi = calls.reduce((sum, q) => sum + q.oi, 0);
  const totalPutOi = puts.reduce((sum, q) => sum + q.oi, 0);
  const totalCallVolume = calls.reduce((sum, q) => sum + q.volume, 0);
  const totalPutVolume = puts.reduce((sum, q) => sum + q.volume, 0);
  const atmStrike = getAtmStrike(chain, instrument.spot);
  const atmCall = getQuote(chain, atmStrike, 'CE');
  const atmPut = getQuote(chain, atmStrike, 'PE');
  const callWall = calls.reduce((a, b) => (b.oi > a.oi ? b : a), calls[0]).strike;
  const putWall = puts.reduce((a, b) => (b.oi > a.oi ? b : a), puts[0]).strike;
  const atmIv = round((((atmCall?.iv ?? 0.15) + (atmPut?.iv ?? 0.17)) / 2) * 100, 2);
  const dte = 2;
  const expectedMoveStraddle = round((atmCall ? mid(atmCall) : 0) + (atmPut ? mid(atmPut) : 0), 2);
  const expectedMoveIv = round(instrument.spot * ((atmIv / 100) * Math.sqrt(dte / 365)), 2);
  const put25 = puts.find((q) => q.delta <= -0.2 && q.delta >= -0.3) ?? puts[0];
  const call25 = calls.find((q) => q.delta >= 0.2 && q.delta <= 0.3) ?? calls[calls.length - 1];
  const liquidityScore = round(chain.reduce((sum, q) => sum + liquidityScoreForQuote(q), 0) / chain.length, 1);

  return {
    pcrOi: round(totalPutOi / totalCallOi, 2),
    pcrVolume: round(totalPutVolume / totalCallVolume, 2),
    maxPain: computeMaxPain(chain),
    callWall,
    putWall,
    expectedMoveStraddle,
    expectedMoveIv,
    atmIv,
    skew: round((put25.iv - call25.iv) * 100, 2),
    termSlope: -1.2,
    quoteAgeSec: Math.max(...chain.map((q) => quoteAgeSec(q.quoteTs))),
    liquidityScore,
    qualityFlags: qualityFlagsForQuotes(chain)
  };
};

export const signedPremium = (leg: OptionLeg) => (leg.side === 'SELL' ? leg.premium : -leg.premium) * leg.quantity;

export const payoffAtExpiry = (legs: OptionLeg[], spot: number, lotSize: number) => {
  const perUnit = legs.reduce((sum, leg) => {
    const intrinsic = leg.type === 'CE' ? Math.max(0, spot - leg.strike) : Math.max(0, leg.strike - spot);
    const expiryValue = leg.side === 'BUY' ? intrinsic : -intrinsic;
    return sum + (expiryValue + (leg.side === 'SELL' ? leg.premium : -leg.premium)) * leg.quantity;
  }, 0);
  return round(perUnit * lotSize, 0);
};

export const buildPayoffGrid = (legs: OptionLeg[], spot: number, lotSize: number) => {
  const min = Math.round((spot * 0.97) / 50) * 50;
  const max = Math.round((spot * 1.03) / 50) * 50;
  const grid = [];
  for (let s = min; s <= max; s += 50) {
    grid.push({ spot: s, pnl: payoffAtExpiry(legs, s, lotSize) });
  }
  return grid;
};

export const aggregateGreeks = (legs: OptionLeg[], lotSize: number) =>
  legs.reduce(
    (sum, leg) => {
      const sign = leg.side === 'BUY' ? 1 : -1;
      const multiplier = sign * leg.quantity * lotSize;
      sum.delta += leg.delta * multiplier;
      sum.gamma += leg.gamma * multiplier;
      sum.theta += leg.theta * multiplier;
      sum.vega += leg.vega * multiplier;
      return sum;
    },
    { delta: 0, gamma: 0, theta: 0, vega: 0 }
  );

export const totalScore = (breakdown: ScoreBreakdown) =>
  round(
    0.25 * breakdown.liquidity +
      0.2 * breakdown.riskReward +
      0.2 * breakdown.regimeFit +
      0.15 * breakdown.volFit +
      0.1 * breakdown.dataConfidence +
      0.1 * breakdown.simplicity,
    1
  );

export const rupee = (value: number | null) => {
  if (value === null || !Number.isFinite(value)) return 'Defined by scenario';
  return `₹${Math.round(value).toLocaleString('en-IN')}`;
};

export const summarizeTrade = (trade: CandidateTrade) => {
  const maxLoss = trade.maxLoss === null ? 'scenario-defined' : rupee(trade.maxLoss);
  const breakevens = trade.breakevens.length ? trade.breakevens.map((b) => round(b, 1)).join(', ') : 'not applicable';
  return `${trade.title}: ${trade.strategy}. Max loss ${maxLoss}. Breakeven ${breakevens}. Score ${trade.score}/100.`;
};
