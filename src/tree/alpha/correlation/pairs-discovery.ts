// Cointegrated pair discovery over a candle universe.

import type { IndicatorCandle } from '../indicator-types';
import type { PairStats } from './types';
import {
  pearsonCorrelation,
  computeSpreadStatistics,
} from './compute';
import { testCointegration } from './adf';
import { causalSlice } from './pairs-utils';

/**
 * Find all cointegrated pairs from a universe of assets.
 * Evaluates pairs over the specified trailing lookback strictly before asOfTime.
 */
export function findCointegratedPairs(
  allCandles: Map<string, readonly IndicatorCandle[]>,
  lookback: number,
  asOfTime?: number,
  minCorrelation = 0.5,
): PairStats[] {
  const symbols = Array.from(allCandles.keys());
  const results: PairStats[] = [];

  for (let i = 0; i < symbols.length; i++) {
    for (let j = i + 1; j < symbols.length; j++) {
      const s1 = symbols[i];
      const s2 = symbols[j];
      const c1 = allCandles.get(s1) ?? [];
      const c2 = allCandles.get(s2) ?? [];

      const s1Slice = causalSlice(c1, asOfTime, lookback);
      const s2Slice = causalSlice(c2, asOfTime, lookback);

      if (s1Slice.length < lookback || s2Slice.length < lookback) continue;

      const corr = pearsonCorrelation(
        s1Slice.map((c) => c.close),
        s2Slice.map((c) => c.close),
      );

      if (Math.abs(corr) < minCorrelation) continue;

      const { cointegrated, pValue } = testCointegration(s1Slice, s2Slice);
      if (!cointegrated) continue;

      const { spreadMean, spreadStd, halfLife } = computeSpreadStatistics(s1Slice, s2Slice, lookback);

      results.push({
        symbol1: s1,
        symbol2: s2,
        correlation: corr,
        halfLife,
        spreadMean,
        spreadStd,
        cointegrationPValue: pValue,
      });
    }
  }

  results.sort((a, b) => Math.abs(b.correlation) - Math.abs(a.correlation));
  return results;
}
