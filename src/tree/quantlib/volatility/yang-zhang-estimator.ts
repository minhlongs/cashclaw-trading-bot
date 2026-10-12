import type { OhlcBar, YangZhangResult } from './yang-zhang-volatility-types';

function sampleVar(vals: readonly number[]): number {
  if (vals.length < 2) return 0;
  const m = vals.reduce((a, b) => a + b, 0) / vals.length;
  return vals.reduce((s, x) => s + (x - m) ** 2, 0) / (vals.length - 1);
}

export function runYzEstimation(bars: readonly OhlcBar[], ann = 365): YangZhangResult {
  const n = bars.length;
  for (const b of bars) {
    if (b.open <= 0 || b.high <= 0 || b.low <= 0 || b.close <= 0) throw new Error('Prices must be positive');
  }
  if (n < 3) throw new Error('Yang-Zhang volatility estimation requires at least 3 bars.');
  const over: number[] = [], oc: number[] = [], rs: number[] = [];
  for (let i = 1; i < n; i++) {
    const prevC = bars[i - 1].close, o = bars[i].open;
    const h = bars[i].high, l = bars[i].low, c = bars[i].close;
    over.push(Math.log(o / prevC));
    oc.push(Math.log(c / o));
    const u = Math.log(h / o), d = Math.log(l / o), cc = Math.log(c / o);
    rs.push(u * (u - cc) + d * (d - cc));
  }
  const m = over.length, vO = sampleVar(over), vC = sampleVar(oc), vRS = rs.reduce((a, b) => a + b, 0) / m;
  const k = Number((0.34 / (1.34 + (m + 1) / (m - 1))).toFixed(6));
  const comp = Math.max(0, vO + k * vC + (1 - k) * vRS);
  const vol = Math.sqrt(comp * ann);
  return {
    overnightVariance: Number(vO.toFixed(8)), openToCloseVariance: Number(vC.toFixed(8)),
    rogersSatchellVariance: Number(vRS.toFixed(8)), compositeVariance: Number(comp.toFixed(8)),
    annualizedVolatility: Number(vol.toFixed(6)), optimalK: k, rawVariance: comp, kFactor: k, barCount: n,
  };
}
