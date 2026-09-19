// Pair signal generation, diversification filtering, and universe scanning.

import type { IndicatorCandle } from '../indicator-types';
import type {
  PairStats,
  PairSignal,
  GeneratePairSignalsOptions,
  MultiPairScanConfig,
  MultiPairScanResult,
} from './types';
import { computeSpreadStatistics } from './compute';
import { causalSlice } from './pairs-utils';
import { findCointegratedPairs } from './pairs-discovery';

/**
 * Generate pair trading signals from discovered pairs.
 * Computes spread z-score causally and emits long_spread / short_spread signals.
 */
export function generatePairSignals(
  pairs: readonly PairStats[],
  allCandles: Map<string, readonly IndicatorCandle[]>,
  options?: number | GeneratePairSignalsOptions,
): PairSignal[] {
  const threshold = typeof options === 'number' ? options : (options?.zScoreThreshold ?? 2.0);
  const asOfTime = typeof options === 'object' ? options?.asOfTime : undefined;
  const lookback = typeof options === 'object' ? options?.lookback : undefined;

  const signals: PairSignal[] = [];

  for (const pair of pairs) {
    const c1 = allCandles.get(pair.symbol1);
    const c2 = allCandles.get(pair.symbol2);
    if (!c1 || !c2) continue;

    const c1Slice = causalSlice(c1, asOfTime, lookback);
    const c2Slice = causalSlice(c2, asOfTime, lookback);
    if (lookback !== undefined && (c1Slice.length < lookback || c2Slice.length < lookback)) {
      continue;
    }
    if (c1Slice.length < 3 || c2Slice.length < 3) continue;

    const { zScore } = computeSpreadStatistics(c1Slice, c2Slice, c1Slice.length);

    if (Math.abs(zScore) < threshold) continue;

    const direction = zScore > 0 ? 'short_spread' : 'long_spread';
    const confidence = Math.min(1, Math.abs(zScore) / 4);

    signals.push({
      pair: [pair.symbol1, pair.symbol2],
      direction,
      zScore,
      confidence,
    });
  }

  signals.sort((a, b) => b.confidence - a.confidence);
  return signals;
}

/**
 * Filter pairs to ensure diversification — reject pairs with too-small spread
 * or insufficient volatility.
 */
export function filterDiversified(
  pairs: readonly PairStats[],
  minSpread = 0.001,
): PairStats[] {
  return pairs.filter((p) => p.spreadStd >= minSpread);
}

/**
 * Executes an end-to-end multi-pair universe scan:
 * 1. Discovers cointegrated pairs over the causal lookback window.
 * 2. Filters candidate pairs by minimum spread variance for diversification.
 * 3. Generates directional spread trading signals.
 */
export function scanMultiPairUniverse(
  allCandles: Map<string, readonly IndicatorCandle[]>,
  config: MultiPairScanConfig,
): MultiPairScanResult {
  const candidatePairs = findCointegratedPairs(
    allCandles,
    config.lookback,
    config.asOfTime,
    config.minCorrelation ?? 0.5,
  );

  const diversifiedPairs = filterDiversified(
    candidatePairs,
    config.minSpreadStd ?? 0.001,
  );

  const signals = generatePairSignals(diversifiedPairs, allCandles, {
    zScoreThreshold: config.zScoreThreshold ?? 2.0,
    asOfTime: config.asOfTime,
    lookback: config.lookback,
  });

  return {
    candidatePairs,
    diversifiedPairs,
    signals,
  };
}
