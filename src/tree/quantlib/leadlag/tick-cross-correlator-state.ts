import type { CrossCorrelationState } from './lead-lag-types';

export function initializeCrossCorrelationState(symbols: string[], maxLag = 5): CrossCorrelationState {
  const lastPrices: Record<string, number> = {};
  const returnHistories: Record<string, number[]> = {};
  const variances: Record<string, number> = {};
  const observationCounts: Record<string, number> = {};
  const lagCovariances: Record<string, Record<number, number>> = {};

  for (const s1 of symbols) {
    lastPrices[s1] = 0;
    returnHistories[s1] = [];
    variances[s1] = 0;
    observationCounts[s1] = 0;
    for (const s2 of symbols) {
      if (s1 === s2) continue;
      const key = `${s1}:${s2}`;
      lagCovariances[key] = {};
      for (let lag = 1; lag <= maxLag; lag++) lagCovariances[key][lag] = 0;
    }
  }

  return { symbols, lastPrices, returnHistories, variances, observationCounts, lagCovariances };
}
