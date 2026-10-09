import type { OhlcBar, YangZhangConfig, YangZhangResult } from './yang-zhang-volatility-types';

function computeSampleVariance(vals: readonly number[]): number {
  const n = vals.length;
  if (n < 2) return 0;
  const mean = vals.reduce((a, b) => a + b, 0) / n;
  const sumSq = vals.reduce((acc, v) => acc + (v - mean) ** 2, 0);
  return sumSq / (n - 1);
}

export class YangZhangVolatilityEngine {
  estimate(bars: readonly OhlcBar[], config?: YangZhangConfig): YangZhangResult {
    const n = bars.length;
    if (n < 3) {
      throw new Error('Yang-Zhang volatility estimation requires at least 3 bars.');
    }

    const overnightReturns: number[] = [];
    const openCloseReturns: number[] = [];
    const rsTerms: number[] = [];

    for (let i = 1; i < n; i++) {
      const prevClose = Math.max(1e-8, bars[i - 1]!.close);
      const open = Math.max(1e-8, bars[i]!.open);
      const high = Math.max(open, bars[i]!.high);
      const low = Math.max(1e-8, Math.min(open, bars[i]!.low));
      const close = Math.max(1e-8, bars[i]!.close);

      overnightReturns.push(Math.log(open / prevClose));
      openCloseReturns.push(Math.log(close / open));

      const u = Math.log(high / open);
      const d = Math.log(low / open);
      const c = Math.log(close / open);
      rsTerms.push(u * (u - c) + d * (d - c));
    }

    const m = overnightReturns.length;
    const varO = computeSampleVariance(overnightReturns);
    const varC = computeSampleVariance(openCloseReturns);
    const varRS = rsTerms.reduce((a, b) => a + b, 0) / m;

    const k = Number((0.34 / (1.34 + (m + 1) / (m - 1))).toFixed(6));
    const compVar = Math.max(0, varO + k * varC + (1 - k) * varRS);

    const annFactor = config?.annualizationFactor ?? 365;
    const annVol = Math.sqrt(compVar * annFactor);

    return {
      overnightVariance: Number(varO.toFixed(8)),
      openToCloseVariance: Number(varC.toFixed(8)),
      rogersSatchellVariance: Number(varRS.toFixed(8)),
      compositeVariance: Number(compVar.toFixed(8)),
      annualizedVolatility: Number(annVol.toFixed(6)),
      optimalK: k,
    };
  }
}
