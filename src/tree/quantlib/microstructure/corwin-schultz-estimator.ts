import type { HighLowBar, CorwinSchultzResult } from './corwin-schultz-types';

const DENOM = 3 - 2 * Math.SQRT2;

export function runCorwinSchultz(bars: readonly HighLowBar[], clamp: boolean): CorwinSchultzResult {
  let sumSpread = 0, sumAlpha = 0, sumBeta = 0, sumGamma = 0;
  const pairs = bars.length - 1;
  for (let i = 0; i < pairs; i++) {
    const b0 = bars[i]!, b1 = bars[i + 1]!;
    if (b0.high <= 0 || b0.low <= 0 || b1.high <= 0 || b1.low <= 0) throw new Error('Prices must be positive');
    if (b0.high < b0.low || b1.high < b1.low) throw new Error('High price cannot be less than low price');
    const hl0 = Math.log(b0.high / b0.low), hl1 = Math.log(b1.high / b1.low);
    const beta = hl0 * hl0 + hl1 * hl1;
    const hMax = Math.max(b0.high, b1.high), lMin = Math.min(b0.low, b1.low);
    const gamma = Math.pow(Math.log(hMax / lMin), 2);
    const rawAlpha = ((Math.SQRT2 - 1) * Math.sqrt(beta)) / DENOM - Math.sqrt(gamma / DENOM);
    const alpha = clamp ? Math.max(0, rawAlpha) : rawAlpha;
    const expA = Math.exp(alpha);
    const spread = (2 * (expA - 1)) / (1 + expA);
    sumBeta += beta; sumGamma += gamma; sumAlpha += alpha; sumSpread += clamp ? Math.max(0, spread) : spread;
  }
  const meanSpread = sumSpread / pairs;
  return {
    estimatedSpread: Number(meanSpread.toFixed(6)),
    estimatedSpreadBps: Number((meanSpread * 10000).toFixed(2)),
    meanAlpha: Number((sumAlpha / pairs).toFixed(6)),
    meanBeta: Number((sumBeta / pairs).toFixed(6)),
    meanGamma: Number((sumGamma / pairs).toFixed(6)),
    pairCount: pairs,
  };
}
