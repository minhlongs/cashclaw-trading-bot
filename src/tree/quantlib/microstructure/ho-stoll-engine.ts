import type { HoStollParams, HoStollQuote, HoStollResult } from './ho-stoll-types';

export function computeHoStollQuotes(p: HoStollParams): HoStollResult {
  const s0 = Math.max(1e-4, p.midPrice), gamma = Math.max(1e-5, p.riskAversion ?? 0.1);
  const sigma = Math.max(1e-4, p.volatility ?? 0.02), t = Math.max(1e-4, p.timeHorizon ?? 1.0);
  const kappa = Math.max(1e-4, p.arrivalIntensity ?? 1.5);
  const baseHalfSpread = (1 / kappa) + 0.5 * gamma * sigma * sigma * t;
  const fullBaseSpread = 2 * baseHalfSpread * s0;
  const shiftPerUnit = gamma * sigma * sigma * t * s0;
  const invs = p.inventories.length > 0 ? p.inventories : [0];
  const quotes: HoStollQuote[] = [];
  let spreadSum = 0;
  for (const q of invs) {
    const reservationPrice = s0 - q * shiftPerUnit;
    const bid = Math.max(1e-4, reservationPrice - baseHalfSpread * s0);
    const ask = reservationPrice + baseHalfSpread * s0;
    const fullSpread = ask - bid;
    spreadSum += fullSpread;
    quotes.push({ inventory: q, reservationPrice, optimalBid: bid, optimalAsk: ask, halfSpread: fullSpread / 2, fullSpread, inventorySkew: reservationPrice - s0 });
  }
  const avgSpread = quotes.length > 0 ? spreadSum / quotes.length : fullBaseSpread;
  return { quotes, averageSpread: avgSpread, baseSpread: fullBaseSpread, reservationPriceShiftPerUnit: shiftPerUnit };
}
