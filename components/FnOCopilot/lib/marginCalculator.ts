import { OptionLeg } from '../types';

/**
 * A rudimentary SPAN margin approximation.
 * In a production environment, this should query a broker's margin API (e.g. Upstox Margin API)
 * because exact margin depends on calendar spreads, IV, and complex netting rules.
 */
export function estimateMargin(legs: OptionLeg[], spotPrice: number): number {
  let margin = 0;
  
  // Calculate raw exposure
  for (const leg of legs) {
    if (leg.side === 'BUY') {
      // Buyers only pay the premium
      margin += leg.premium * leg.quantity;
    } else {
      // Sellers require SPAN + Exposure margin. We approximate this as roughly 15% of the underlying contract value.
      // E.g. For Nifty at 23000, 1 lot = 25. Contract value = 23000 * 25 = 575,000. 15% = 86,250.
      const contractValue = spotPrice * leg.quantity;
      let shortMargin = contractValue * 0.15;
      
      // If it's an OTM put or call, the margin requirement usually drops slightly, but we keep it simple here.
      margin += shortMargin;
    }
  }

  // Very naive hedge benefit calculation:
  // If there's a long leg and a short leg of the same type, we cap the margin to the max loss of the spread
  const calls = legs.filter(l => l.type === 'CE');
  const puts = legs.filter(l => l.type === 'PE');

  margin = applySpreadBenefit(margin, calls);
  margin = applySpreadBenefit(margin, puts);

  return margin;
}

function applySpreadBenefit(currentMargin: number, sameTypeLegs: OptionLeg[]): number {
  const longs = sameTypeLegs.filter(l => l.side === 'BUY');
  const shorts = sameTypeLegs.filter(l => l.side === 'SELL');

  if (longs.length > 0 && shorts.length > 0) {
    // If hedged, max loss is typically the width of the spread * quantity
    // Here we just apply a flat 60% discount to the short margin as a naive hedge benefit
    return currentMargin * 0.4; 
  }
  return currentMargin;
}
