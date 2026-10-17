import type { ChlBar, AbdiRanaldoResult } from './abdi-ranaldo-types';

export function runAbdiRanaldo(
  bars: readonly ChlBar[],
  method: 'two-day-corrected' | 'pooled-truncated',
): AbdiRanaldoResult {
  const pairs = bars.length - 1;
  let sumSpread = 0, sumSquaredCov = 0, sumAbsDev = 0;
  for (let i = 0; i < pairs; i++) {
    const b0 = bars[i]!, b1 = bars[i + 1]!;
    if (b0.high <= 0 || b0.low <= 0 || b0.close <= 0 || b1.high <= 0 || b1.low <= 0 || b1.close <= 0) {
      throw new Error('CHL prices must be strictly positive');
    }
    if (b0.high < b0.low || b1.high < b1.low) throw new Error('High price cannot be less than low price');
    const c0 = Math.log(b0.close), eta0 = 0.5 * (Math.log(b0.high) + Math.log(b0.low));
    const eta1 = 0.5 * (Math.log(b1.high) + Math.log(b1.low));
    const prod = (c0 - eta0) * (c0 - eta1);
    sumAbsDev += Math.abs(c0 - eta0);
    sumSquaredCov += prod;
    sumSpread += 2 * Math.sqrt(Math.max(0, prod));
  }
  const spread = method === 'two-day-corrected'
    ? sumSpread / pairs
    : 2 * Math.sqrt(Math.max(0, sumSquaredCov / pairs));
  return {
    effectiveSpread: Number(spread.toFixed(6)),
    effectiveSpreadBps: Number((spread * 10000).toFixed(2)),
    meanMidRangeDeviation: Number((sumAbsDev / pairs).toFixed(6)),
    pairCount: pairs,
  };
}
