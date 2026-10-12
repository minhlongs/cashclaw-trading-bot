import type { OhlcBar, RogersSatchellResult } from './rogers-satchell-types';

export function runRsEstimation(bars: readonly OhlcBar[], ann = 365): RogersSatchellResult {
  const n = bars.length;
  for (const b of bars) {
    if (b.open <= 0 || b.high <= 0 || b.low <= 0 || b.close <= 0) throw new Error('Prices must be positive');
  }
  if (n < 2) throw new Error('Rogers-Satchell volatility estimation requires at least 2 bars.');
  let sum = 0;
  for (let i = 0; i < n; i++) {
    const { open: o, high: h, low: l, close: c } = bars[i];
    const u = Math.log(h / o);
    const d = Math.log(l / o);
    const cc = Math.log(c / o);
    sum += u * (u - cc) + d * (d - cc);
  }
  const rawVariance = Math.max(0, sum / n);
  const annualizedVolatility = Math.sqrt(rawVariance * ann);
  return {
    rawVariance: Number(rawVariance.toFixed(8)),
    annualizedVolatility: Number(annualizedVolatility.toFixed(6)),
    barCount: n,
    driftIndependent: true,
  };
}
