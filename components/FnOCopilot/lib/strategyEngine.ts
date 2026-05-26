import { CandidateTrade, ChainAnalytics, Instrument, OptionLeg, OptionQuote, OptionType, ScoreBreakdown, TradeSide } from '../types';
import {
  aggregateGreeks,
  buildPayoffGrid,
  getAtmStrike,
  getQuote,
  liquidityScoreForQuote,
  nearestStrike,
  qualityFlagsForQuotes,
  round,
  signedPremium,
  totalScore
} from './calculations';

type CandidateInput = {
  id: string;
  title: string;
  strategy: string;
  direction: CandidateTrade['direction'];
  thesis: string;
  legs: OptionLeg[];
  riskTags: string[];
  regimeFit: number;
  volFit: number;
  simplicity: number;
};

const lotAware = (valuePerUnit: number, instrument: Instrument) => round(Math.abs(valuePerUnit * instrument.lotSize), 0);

const makeLeg = (
  chain: OptionQuote[],
  side: TradeSide,
  type: OptionType,
  strike: number,
  expiry: string,
  quantity = 1
): OptionLeg | null => {
  const quote = getQuote(chain, strike, type);
  if (!quote) return null;
  const premium = quote.bid > 0 && quote.ask > 0 ? round((quote.bid + quote.ask) / 2, 2) : quote.ltp;
  return {
    id: `${side}-${type}-${strike}-${quantity}`,
    side,
    type,
    strike,
    expiry,
    quantity,
    premium,
    iv: quote.iv,
    delta: quote.delta,
    gamma: quote.gamma,
    theta: quote.theta,
    vega: quote.vega,
    rho: quote.rho
  };
};

const compactLegs = (...legs: Array<OptionLeg | null>) => {
  if (legs.some((leg) => !leg)) return null;
  return legs as OptionLeg[];
};

const quoteForLeg = (chain: OptionQuote[], leg: OptionLeg) => getQuote(chain, leg.strike, leg.type);

const estimatePop = (input: CandidateInput, analytics: Pick<ChainAnalytics, 'atmIv' | 'skew'>) => {
  const shortLegs = input.legs.filter((leg) => leg.side === 'SELL');
  const longDebit = input.legs.every((leg) => leg.side === 'BUY');
  if (input.direction === 'range-bound' && shortLegs.length >= 2) return round(Math.max(42, Math.min(78, 70 - analytics.skew * 0.8)), 1);
  if (input.direction === 'volatility') return round(Math.max(28, Math.min(52, 48 - analytics.atmIv * 0.35)), 1);
  if (longDebit) return 45;
  const avgShortDelta = shortLegs.length ? shortLegs.reduce((sum, leg) => sum + Math.abs(leg.delta), 0) / shortLegs.length : 0.42;
  return round(Math.max(35, Math.min(82, (1 - avgShortDelta) * 100)), 1);
};

const createCandidate = (instrument: Instrument, chain: OptionQuote[], input: CandidateInput): CandidateTrade => {
  const quotes = input.legs.map((leg) => quoteForLeg(chain, leg)).filter((q): q is OptionQuote => !!q);
  const netPremiumPerUnit = input.legs.reduce((sum, leg) => sum + signedPremium(leg), 0);
  const payoff = buildPayoffGrid(input.legs, instrument.spot, instrument.lotSize);
  const maxGridProfit = Math.max(...payoff.map((p) => p.pnl));
  const maxGridLoss = Math.min(...payoff.map((p) => p.pnl));
  const maxProfit = maxGridProfit > 0 ? maxGridProfit : null;
  const maxLoss = maxGridLoss < 0 ? Math.abs(maxGridLoss) : null;
  const liquidity = quotes.length
    ? round(quotes.reduce((sum, q) => sum + liquidityScoreForQuote(q), 0) / quotes.length, 1)
    : 0;
  const riskReward = maxLoss && maxProfit ? Math.min(100, round((maxProfit / maxLoss) * 75, 1)) : 40;
  const dataConfidence = Math.max(0, 100 - qualityFlagsForQuotes(quotes).length * 18);
  const scoreBreakdown: ScoreBreakdown = {
    liquidity,
    riskReward,
    regimeFit: input.regimeFit,
    volFit: input.volFit,
    dataConfidence,
    simplicity: input.simplicity
  };
  const greeks = aggregateGreeks(input.legs, instrument.lotSize);
  const qualityFlags = qualityFlagsForQuotes(quotes);
  const breakevens = inferBreakevens(input.legs, payoff);

  return {
    id: input.id,
    title: input.title,
    strategy: input.strategy,
    direction: input.direction,
    thesis: `${input.thesis} Net ${netPremiumPerUnit >= 0 ? 'credit' : 'debit'}: ₹${round(Math.abs(netPremiumPerUnit), 1)} per unit. Net delta ${round(greeks.delta, 1)}, theta ${round(greeks.theta, 1)}, vega ${round(greeks.vega, 1)}.`,
    legs: input.legs,
    netPremium: lotAware(netPremiumPerUnit, instrument),
    maxProfit,
    maxLoss,
    breakevens,
    pop: estimatePop(input, computeMiniAnalytics(chain)),
    score: totalScore(scoreBreakdown),
    scoreBreakdown,
    qualityFlags,
    riskTags: input.riskTags,
    payoff
  };
};

const computeMiniAnalytics = (chain: OptionQuote[]): Pick<ChainAnalytics, 'atmIv' | 'skew'> => {
  const calls = chain.filter((q) => q.type === 'CE');
  const puts = chain.filter((q) => q.type === 'PE');
  const avgIv = chain.length ? chain.reduce((sum, quote) => sum + quote.iv, 0) / chain.length : 0.2;
  const call25 = calls.find((q) => q.delta >= 0.2 && q.delta <= 0.3) ?? calls[calls.length - 1];
  const put25 = puts.find((q) => q.delta <= -0.2 && q.delta >= -0.3) ?? puts[0];
  return {
    atmIv: round(avgIv * 100, 2),
    skew: round(((put25?.iv ?? avgIv) - (call25?.iv ?? avgIv)) * 100, 2)
  };
};

const inferBreakevens = (legs: OptionLeg[], payoff: Array<{ spot: number; pnl: number }>) => {
  const breaks: number[] = [];
  for (let i = 1; i < payoff.length; i += 1) {
    const prev = payoff[i - 1];
    const curr = payoff[i];
    if ((prev.pnl < 0 && curr.pnl >= 0) || (prev.pnl > 0 && curr.pnl <= 0)) {
      const distance = curr.spot - prev.spot;
      const ratio = Math.abs(prev.pnl) / Math.max(1, Math.abs(prev.pnl) + Math.abs(curr.pnl));
      breaks.push(round(prev.spot + distance * ratio, 1));
    }
  }

  if (breaks.length) return breaks;
  const singleLong = legs.length === 1 && legs[0].side === 'BUY';
  if (singleLong) {
    const leg = legs[0];
    return [leg.type === 'CE' ? leg.strike + leg.premium : leg.strike - leg.premium];
  }
  return [];
};

export const generateTopTrades = (instrument: Instrument, chain: OptionQuote[], analytics: ChainAnalytics): CandidateTrade[] => {
  const atm = getAtmStrike(chain, instrument.spot);
  const nearLower = nearestStrike(chain, instrument.spot - analytics.expectedMoveStraddle * 0.5);
  const nearUpper = nearestStrike(chain, instrument.spot + analytics.expectedMoveStraddle * 0.5);
  const farLower = nearestStrike(chain, instrument.spot - analytics.expectedMoveStraddle);
  const farUpper = nearestStrike(chain, instrument.spot + analytics.expectedMoveStraddle);
  const lowerWing = nearestStrike(chain, instrument.spot - analytics.expectedMoveStraddle * 1.4);
  const upperWing = nearestStrike(chain, instrument.spot + analytics.expectedMoveStraddle * 1.4);

  const raw: CandidateInput[] = [];

  const ironCondorLegs = compactLegs(
    makeLeg(chain, 'BUY', 'PE', lowerWing, instrument.expiry),
    makeLeg(chain, 'SELL', 'PE', nearLower, instrument.expiry),
    makeLeg(chain, 'SELL', 'CE', nearUpper, instrument.expiry),
    makeLeg(chain, 'BUY', 'CE', upperWing, instrument.expiry)
  );
  if (ironCondorLegs) {
    raw.push({
      id: 'top5-iron-condor',
      title: 'Range Credit: Iron Condor',
      strategy: 'Iron Condor',
      direction: 'range-bound',
      thesis: 'PCR is balanced and spot sits between the strongest OI walls, so this defined-risk credit trade benefits from time decay if NIFTY remains inside the expected move.',
      legs: ironCondorLegs,
      riskTags: ['Defined risk', 'Theta positive', 'Avoid event shock'],
      regimeFit: analytics.pcrOi > 0.85 && analytics.pcrOi < 1.25 ? 88 : 64,
      volFit: analytics.atmIv > 14 ? 82 : 68,
      simplicity: 74
    });
  }

  const bullCallLegs = compactLegs(
    makeLeg(chain, 'BUY', 'CE', atm, instrument.expiry),
    makeLeg(chain, 'SELL', 'CE', nearUpper, instrument.expiry)
  );
  if (bullCallLegs) {
    raw.push({
      id: 'top5-bull-call-spread',
      title: 'Directional Debit: Bull Call Spread',
      strategy: 'Bull Call Spread',
      direction: 'bullish',
      thesis: 'Underlying trend score is positive while call-side premium is still contained near ATM, creating a defined-risk upside structure.',
      legs: bullCallLegs,
      riskTags: ['Defined risk', 'Needs upside follow-through', 'Debit paid upfront'],
      regimeFit: instrument.spot > instrument.previousClose ? 84 : 55,
      volFit: analytics.atmIv < 18 ? 78 : 60,
      simplicity: 88
    });
  }

  const bearPutLegs = compactLegs(
    makeLeg(chain, 'BUY', 'PE', atm, instrument.expiry),
    makeLeg(chain, 'SELL', 'PE', nearLower, instrument.expiry)
  );
  if (bearPutLegs) {
    raw.push({
      id: 'top5-bear-put-spread',
      title: 'Risk Hedge: Bear Put Spread',
      strategy: 'Bear Put Spread',
      direction: 'bearish',
      thesis: 'Put wall support is below spot, so this trade acts as a controlled downside hedge if support breaks.',
      legs: bearPutLegs,
      riskTags: ['Defined risk', 'Hedge profile', 'Needs downside move'],
      regimeFit: analytics.pcrOi < 0.9 ? 80 : 58,
      volFit: analytics.atmIv < 18 ? 74 : 58,
      simplicity: 88
    });
  }

  const ironFlyLegs = compactLegs(
    makeLeg(chain, 'BUY', 'PE', farLower, instrument.expiry),
    makeLeg(chain, 'SELL', 'PE', atm, instrument.expiry),
    makeLeg(chain, 'SELL', 'CE', atm, instrument.expiry),
    makeLeg(chain, 'BUY', 'CE', farUpper, instrument.expiry)
  );
  if (ironFlyLegs) {
    raw.push({
      id: 'top5-iron-butterfly',
      title: 'Pin Risk: Iron Butterfly',
      strategy: 'Iron Butterfly',
      direction: 'range-bound',
      thesis: 'ATM straddle is rich relative to short DTE, so the trade monetizes time decay around max-pain while strictly capping tail loss.',
      legs: ironFlyLegs,
      riskTags: ['Defined risk', 'High pin sensitivity', 'Needs active exit rule'],
      regimeFit: analytics.maxPain === atm ? 82 : 68,
      volFit: analytics.atmIv > 14 ? 86 : 62,
      simplicity: 68
    });
  }

  const longStraddleLegs = compactLegs(
    makeLeg(chain, 'BUY', 'CE', atm, instrument.expiry),
    makeLeg(chain, 'BUY', 'PE', atm, instrument.expiry)
  );
  if (longStraddleLegs) {
    raw.push({
      id: 'top5-long-straddle',
      title: 'Volatility Breakout: Long Straddle',
      strategy: 'Long Straddle',
      direction: 'volatility',
      thesis: 'This is a clean educational volatility trade when the user expects a sharp move and wants unlimited convexity on either side.',
      legs: longStraddleLegs,
      riskTags: ['Defined debit risk', 'Theta negative', 'Needs large move'],
      regimeFit: analytics.expectedMoveStraddle < analytics.expectedMoveIv * 1.1 ? 74 : 58,
      volFit: analytics.atmIv < 16 ? 82 : 54,
      simplicity: 82
    });
  }

  const bullPutLegs = compactLegs(
    makeLeg(chain, 'SELL', 'PE', nearLower, instrument.expiry),
    makeLeg(chain, 'BUY', 'PE', farLower, instrument.expiry)
  );
  if (bullPutLegs) {
    raw.push({
      id: 'top5-bull-put-spread',
      title: 'Support Credit: Bull Put Spread',
      strategy: 'Bull Put Spread',
      direction: 'bullish',
      thesis: 'Put OI is concentrated below spot, so this credit spread expresses support holding while keeping downside bounded.',
      legs: bullPutLegs,
      riskTags: ['Defined risk', 'Theta positive', 'Gap-down risk'],
      regimeFit: analytics.putWall <= nearLower ? 82 : 66,
      volFit: analytics.atmIv > 14 ? 76 : 61,
      simplicity: 84
    });
  }

  const butterflyLegs = compactLegs(
    makeLeg(chain, 'BUY', 'CE', nearLower, instrument.expiry),
    makeLeg(chain, 'SELL', 'CE', atm, instrument.expiry, 2),
    makeLeg(chain, 'BUY', 'CE', nearUpper, instrument.expiry)
  );
  if (butterflyLegs) {
    raw.push({
      id: 'top5-long-call-butterfly',
      title: 'Targeted Upside: Long Call Butterfly',
      strategy: 'Long Call Butterfly',
      direction: 'bullish',
      thesis: 'A defined-debit butterfly focuses reward near the expected upside target while keeping both tails capped for educational paper testing.',
      legs: butterflyLegs,
      riskTags: ['Defined debit risk', 'Targeted payoff', 'Needs strike pin near body'],
      regimeFit: instrument.spot >= instrument.previousClose ? 78 : 58,
      volFit: analytics.atmIv < 18 ? 76 : 56,
      simplicity: 62
    });
  }

  const protectivePutLegs = compactLegs(
    makeLeg(chain, 'BUY', 'PE', nearLower, instrument.expiry)
  );
  if (protectivePutLegs) {
    raw.push({
      id: 'top5-protective-put',
      title: 'Defined Hedge: Protective Put',
      strategy: 'Protective Put',
      direction: 'hedged',
      thesis: 'A long put is a simple educational hedge when the user wants downside protection without selling options.',
      legs: protectivePutLegs,
      riskTags: ['Defined debit risk', 'Portfolio hedge', 'Theta negative'],
      regimeFit: analytics.pcrOi < 0.95 ? 74 : 61,
      volFit: analytics.atmIv < 20 ? 70 : 52,
      simplicity: 92
    });
  }

  return raw
    .map((input) => createCandidate(instrument, chain, input))
    .sort((a, b) => b.score - a.score)
    .slice(0, 8);
};
