import { describe, it, expect } from 'vitest';
import type { IndicatorCandle } from '../indicator-types';
import {
  findCointegratedPairs,
  generatePairSignals,
  scanMultiPairUniverse,
} from './pairs';

function makeCandles(
  closes: number[],
  startTs = 1_000_000,
): IndicatorCandle[] {
  return closes.map((close, i) => ({
    timestamp: startTs + i * 60_000,
    open: close,
    high: close,
    low: close,
    close,
    volume: 100,
  }));
}

describe('Causal pairs trading & scanMultiPairUniverse', () => {
  it('guarantees causal no-lookahead invariant in generatePairSignals', () => {
    // Base trend + stationary mean-reverting spread
    const base = Array.from({ length: 60 }, (_, i) => 100 + i * 0.5 + Math.sin(i * 0.2) * 2);
    const spreadNoise = Array.from({ length: 60 }, (_, i) => Math.sin(i * 1.2) * 2);
    const closesA = base;
    const closesB = base.map((v, i) => v * 2 + spreadNoise[i]);

    const candlesA1 = makeCandles(closesA, 1_000_000);
    const candlesB1 = makeCandles(closesB, 1_000_000);

    const asOfTime = 1_000_000 + 60 * 60_000; // strictly after the 60th candle

    const map1 = new Map<string, IndicatorCandle[]>([
      ['A', candlesA1],
      ['B', candlesB1],
    ]);

    const pairs1 = findCointegratedPairs(map1, 50, asOfTime);
    expect(pairs1.length).toBeGreaterThan(0);

    const signals1 = generatePairSignals(pairs1, map1, {
      asOfTime,
      lookback: 50,
      zScoreThreshold: 0.1,
    });
    expect(signals1.length).toBeGreaterThan(0);

    // Now append future bars with radical shocks at timestamps >= asOfTime
    const futureClosesA = [9999, 12345, 50000, 2];
    const futureClosesB = [1, 2, 3, 4];
    const futureCandlesA = futureClosesA.map((close, i) => ({
      timestamp: asOfTime + i * 60_000,
      open: close,
      high: close,
      low: close,
      close,
      volume: 500,
    }));
    const futureCandlesB = futureClosesB.map((close, i) => ({
      timestamp: asOfTime + i * 60_000,
      open: close,
      high: close,
      low: close,
      close,
      volume: 500,
    }));

    const map2 = new Map<string, IndicatorCandle[]>([
      ['A', [...candlesA1, ...futureCandlesA]],
      ['B', [...candlesB1, ...futureCandlesB]],
    ]);

    const pairs2 = findCointegratedPairs(map2, 50, asOfTime);
    const signals2 = generatePairSignals(pairs2, map2, {
      asOfTime,
      lookback: 50,
      zScoreThreshold: 0.1,
    });

    // Invariant: results must be bit-for-bit identical regardless of future bars
    expect(pairs2).toEqual(pairs1);
    expect(signals2).toEqual(signals1);
  });

  it('scans multi-pair universe end-to-end and filters by spreadStd', () => {
    const base = Array.from({ length: 60 }, (_, i) => 100 + i * 0.5 + Math.sin(i * 0.2) * 2);
    const spreadNoise = Array.from({ length: 60 }, (_, i) => Math.sin(i * 1.2) * 2);
    const allCandles = new Map<string, IndicatorCandle[]>();
    allCandles.set('BTC', makeCandles(base));
    allCandles.set('ETH', makeCandles(base.map((v, i) => v * 2 + spreadNoise[i])));
    allCandles.set('DOGE', makeCandles(Array.from({ length: 60 }, () => Math.random() * 10)));

    const asOfTime = 1_000_000 + 60 * 60_000;

    const result = scanMultiPairUniverse(allCandles, {
      lookback: 50,
      asOfTime,
      minCorrelation: 0.5,
      minSpreadStd: 0.0001,
      zScoreThreshold: 0.01,
    });

    expect(result.candidatePairs.length).toBeGreaterThan(0);
    expect(result.diversifiedPairs.length).toBeGreaterThan(0);
    expect(result.candidatePairs.some((p) => p.symbol1 === 'BTC' && p.symbol2 === 'ETH')).toBe(true);

    // Filter out everything with an impossibly high minSpreadStd
    const strictResult = scanMultiPairUniverse(allCandles, {
      lookback: 50,
      asOfTime,
      minSpreadStd: 999999,
    });
    expect(strictResult.diversifiedPairs.length).toBe(0);
    expect(strictResult.signals.length).toBe(0);
  });

  it('preserves no-lookahead invariant in scanMultiPairUniverse', () => {
    const base = Array.from({ length: 60 }, (_, i) => 100 + i * 0.5 + Math.sin(i * 0.2) * 2);
    const spreadNoise = Array.from({ length: 60 }, (_, i) => Math.sin(i * 1.2) * 2);
    const allCandles = new Map<string, IndicatorCandle[]>();
    allCandles.set('BTC', makeCandles(base, 1_000_000));
    allCandles.set('ETH', makeCandles(base.map((v, i) => v * 2 + spreadNoise[i]), 1_000_000));

    const asOfTime = 1_000_000 + 60 * 60_000;
    const config = {
      lookback: 50,
      asOfTime,
      minCorrelation: 0.5,
      minSpreadStd: 0.0001,
      zScoreThreshold: 0.1,
    };

    const run1 = scanMultiPairUniverse(allCandles, config);
    expect(run1.signals.length).toBeGreaterThan(0);

    // Inject contaminated future bars
    allCandles.get('BTC')!.push({
      timestamp: asOfTime + 60_000,
      open: 99999,
      high: 99999,
      low: 99999,
      close: 99999,
      volume: 1,
    });
    allCandles.get('ETH')!.push({
      timestamp: asOfTime + 60_000,
      open: 1,
      high: 1,
      low: 1,
      close: 1,
      volume: 1,
    });

    const run2 = scanMultiPairUniverse(allCandles, config);

    expect(run2.candidatePairs).toEqual(run1.candidatePairs);
    expect(run2.diversifiedPairs).toEqual(run1.diversifiedPairs);
    expect(run2.signals).toEqual(run1.signals);
  });
});
