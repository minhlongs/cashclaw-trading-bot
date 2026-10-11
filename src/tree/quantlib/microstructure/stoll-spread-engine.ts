import type { StollSpreadParams, StollSpreadResult } from './stoll-spread-types';

function cov(x: number[], y: number[]): number {
  if (x.length < 2) return 0;
  const mx = x.reduce((a, b) => a + b, 0) / x.length, my = y.reduce((a, b) => a + b, 0) / y.length;
  return x.reduce((acc, xi, i) => acc + (xi - mx) * (y[i] - my), 0) / (x.length - 1);
}

export function computeStollSpread(p: StollSpreadParams): StollSpreadResult {
  const t = p.ticks;
  if (t.length < 3) return { effectiveSpread: 0, adverseSelectionFraction: 0, inventoryHoldingFraction: 0, orderProcessingFraction: 1, impliedRollSpread: 0, serialCovariancePrice: 0, serialCovarianceMidpoint: 0 };
  const dp: number[] = [], dm: number[] = [];
  for (let i = 1; i < t.length; i++) { dp.push(t[i].price - t[i - 1].price); dm.push(t[i].midpoint - t[i - 1].midpoint); }
  const dpT = dp.slice(1), dpLag = dp.slice(0, -1), dmT = dm.slice(1), dmLag = dm.slice(0, -1);
  const covP = cov(dpT, dpLag), covM = cov(dmT, dmLag), crossCov = cov(dmT, dpLag);
  const rollSpread = 2 * Math.sqrt(Math.max(0, -covP));
  const avgObsSpread = t.reduce((acc, k) => acc + 2 * Math.abs(k.price - k.midpoint), 0) / t.length;
  const spread = Math.max(1e-4, p.spreadOverride ?? (rollSpread > 0 ? rollSpread : avgObsSpread));
  const halfSpreadSq = Math.pow(spread / 2, 2);
  const alpha = Math.max(0, Math.min(1, Math.max(0, crossCov) / halfSpreadSq));
  const gamma = Math.max(0, Math.min(1 - alpha, Math.max(0, -covM) / halfSpreadSq));
  const pi = Math.max(0, 1 - alpha - gamma);
  return { effectiveSpread: spread, adverseSelectionFraction: alpha, inventoryHoldingFraction: gamma, orderProcessingFraction: pi, impliedRollSpread: rollSpread, serialCovariancePrice: covP, serialCovarianceMidpoint: covM };
}
