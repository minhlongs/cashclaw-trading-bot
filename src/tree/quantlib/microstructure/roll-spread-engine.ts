import type { RollSpreadParams, RollSpreadResult } from './roll-spread-types';

export function computeRollSpread(p: RollSpreadParams): RollSpreadResult {
  const prices = p.priceSeries;
  if (prices.length < 3) {
    return { autocovariance: 0, rollSpread: 0, effectiveSpreadPct: 0, isAutocovarianceNegative: false, numObservations: prices.length };
  }
  const deltaP: number[] = [];
  for (let i = 1; i < prices.length; i++) deltaP.push(prices[i] - prices[i - 1]);
  const n = deltaP.length - 1;
  const mean1 = deltaP.slice(1).reduce((a, b) => a + b, 0) / n;
  const mean0 = deltaP.slice(0, -1).reduce((a, b) => a + b, 0) / n;
  let cov = 0;
  for (let i = 1; i < deltaP.length; i++) {
    cov += (deltaP[i] - mean1) * (deltaP[i - 1] - mean0);
  }
  cov /= n;

  const isNeg = cov < 0;
  const rawSpread = isNeg ? 2 * Math.sqrt(-cov) : 0;
  const avgPrice = prices.reduce((a, b) => a + b, 0) / prices.length;
  const tick = p.tickSize ?? 1e-4;
  const rollSpread = Math.max(0, Math.round(rawSpread / tick) * tick);
  const effectiveSpreadPct = avgPrice > 0 ? (rollSpread / avgPrice) * 100 : 0;

  return { autocovariance: cov, rollSpread, effectiveSpreadPct, isAutocovarianceNegative: isNeg, numObservations: prices.length };
}
