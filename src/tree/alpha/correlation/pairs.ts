// Pair discovery, signal generation, and diversification filtering for pairs trading.

import type { IndicatorCandle } from '../indicator-types';
import type { PairStats, PairSignal } from './types';
import {
  pearsonCorrelation,
  computeSpreadStatistics,
} from './compute';
import { testCointegration } from './adf';

/**
 * Find all cointegrated pairs from a universe of assets.
 * Iterates over unique pairs, tests cointegration, and returns qualifying pairs.
 */
export function findCointegratedPairs(
  allCandles: Map<string, readonly IndicatorCandle[]>,
  lookback: number,
): PairStats[] {
  const symbols = Array.from(allCandles.keys());
  const results: PairStats[] = [];

  for (let i = 0; i < symbols.length; i++) {
    for (let j = i + 1; j < symbols.length; j++) {
      const s1 = symbols[i];
      const s2 = symbols[j];
      const c1 = allCandles.get(s1) ?? [];
      const c2 = allCandles.get(s2) ?? [];

      if (c1.length < lookback || c2.length < lookback) continue;

      const s1Slice = c1.slice(-lookback);
      const s2Slice = c2.slice(-lookback);

      const corr = pearsonCorrelation(
        s1Slice.map((c) => c.close),
        s2Slice.map((c) => c.close),
      );

      // Require minimum absolute correlation
      if (Math.abs(corr) < 0.5) continue;

      const { cointegrated, pValue } = testCointegration(c1, c2);
      if (!cointegrated) continue;

      const { spreadMean, spreadStd, halfLife } = computeSpreadStatistics(c1, c2, lookback);

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

  // Sort by correlation strength descending
  results.sort((a, b) => Math.abs(b.correlation) - Math.abs(a.correlation));
  return results;
}

/**
 * Generate pair trading signals from discovered pairs.
 * Computes the current spread z-score and emits long_spread / short_spread signals
 * when the z-score exceeds a threshold.
 */
export function generatePairSignals(
  pairs: PairStats[],
  allCandles: Map<string, readonly IndicatorCandle[]>,
  zScoreThreshold = 2.0,
): PairSignal[] {
  const signals: PairSignal[] = [];

  for (const pair of pairs) {
    const c1 = allCandles.get(pair.symbol1);
    const c2 = allCandles.get(pair.symbol2);
    if (!c1 || !c2) continue;

    const { zScore } = computeSpreadStatistics(c1, c2, c1.length);

    if (Math.abs(zScore) < zScoreThreshold) continue;

    const direction = zScore > 0 ? 'short_spread' : 'long_spread';
    const confidence = Math.min(1, Math.abs(zScore) / 4);

    signals.push({
      pair: [pair.symbol1, pair.symbol2],
      direction,
      zScore,
      confidence,
    });
  }

  // Sort by confidence descending
  signals.sort((a, b) => b.confidence - a.confidence);
  return signals;
}

/**
 * Filter pairs to ensure diversification — reject pairs with too-small spread
 * (not enough profit potential) or highly overlapping exposure.
 */
export function filterDiversified(
  pairs: PairStats[],
  minSpread = 0.001,
): PairStats[] {
  return pairs.filter((p) => p.spreadStd >= minSpread);
}
