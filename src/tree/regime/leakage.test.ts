// Regime Engine — Future-Data Leakage Tests
//
// The regime classifier must be causal: at timestamp T it may only use data
// available at or before T. These tests detect violations by extracting
// features at a fixed historical index and then proving the result is
// invariant to everything that happens after that index.
//
// The attack surface is broad: a classifier that peeks at the close of the
// NEXT candle, or at a volume spike that hasn't happened yet, would produce a
// different label here. We also test the feature extractor directly, since a
// leak in features propagates into the label.

import { describe, it, expect } from 'vitest';
import { RuleBasedRegimeClassifier } from './classifier';
import { extractRegimeFeatures } from './features';
import type { RegimeConfig } from './types';
import type { Candle } from '@/forest/backtest/ohlcv';

const CONFIG: RegimeConfig = {
  minCandles: 10,
  confidenceThreshold: 0.6,
  lookback: 10,
  minDuration: 3,
};

function makeCandles(count: number, basePrice = 1000, amp = 5): Candle[] {
  const candles: Candle[] = [];
  let price = basePrice;
  for (let i = 0; i < count; i++) {
    const variance = Math.sin(i * 0.3) * amp;
    price = Math.max(1, price + variance);
    candles.push({
      timestamp: 1_700_000_000_000 + i * 3_600_000,
      open: price - 0.5,
      high: price + 1,
      low: price - 1,
      close: price,
      volume: 1000 + Math.floor(Math.sin(i) * 500) + 500,
    });
  }
  return candles;
}

describe('regime feature extraction — causal', () => {
  it('features at a fixed index are invariant to candles after that index', () => {
    const candles = makeCandles(60);
    const f = extractRegimeFeatures(candles, CONFIG, 50);
    expect(f).not.toBeNull();

    // Append a wildly different future regime — a crash then a spike.
    const future: Candle[] = [];
    for (let i = 0; i < 20; i++) {
      future.push({
        timestamp: candles[candles.length - 1].timestamp + (i + 1) * 3_600_000,
        open: 100, high: 101, low: 1, close: 2, volume: 999_999,
      });
    }
    const f2 = extractRegimeFeatures([...candles, ...future], CONFIG, 50);
    expect(f2).not.toBeNull();
    // Same index → same features, regardless of what exists later.
    expect(f2).toEqual(f);
  });

  it('a future candle cannot change a past classification', () => {
    const classifier = new RuleBasedRegimeClassifier();
    const candles = makeCandles(60);
    const f = extractRegimeFeatures(candles, CONFIG, 50);
    expect(f).not.toBeNull();
    const resultAt50 = classifier.classify(f!, CONFIG);

    // Mutate everything after T=50 to a completely different market.
    const mutated = candles.slice();
    for (let i = 51; i < mutated.length; i++) {
      mutated[i] = { ...mutated[i], close: 2, high: 2.1, low: 1.9, volume: 1 };
    }
    const f2 = extractRegimeFeatures(mutated, CONFIG, 50);
    expect(f2).not.toBeNull();
    const resultStillAt50 = classifier.classify(f2!, CONFIG);

    // The label at T=50 must be identical whether or not the future exists.
    expect(resultStillAt50.label).toBe(resultAt50.label);
  });

  it('features never read beyond the requested index', () => {
    // Make the very next candle a regime-shifting event (huge vol spike).
    // A causal extractor at index 30 must not absorb it.
    const candles = makeCandles(60);
    candles[31] = { ...candles[31], close: candles[31].close + 3000, high: candles[31].high + 3000, low: 1, volume: 5_000_000 };

    const f = extractRegimeFeatures(candles, CONFIG, 30);
    expect(f).not.toBeNull();

    // Re-extract on the identical prefix — must match exactly.
    const f2 = extractRegimeFeatures(candles.slice(0, 31), CONFIG, 30);
    expect(f2).not.toBeNull();
    expect(f2).toEqual(f);
  });

  it('all six features are finite numbers computed from the window', () => {
    const candles = makeCandles(60);
    const f = extractRegimeFeatures(candles, CONFIG, 50);
    expect(f).not.toBeNull();
    for (const key of Object.keys(f!) as (keyof typeof f)[]) {
      expect(Number.isFinite(f![key])).toBe(true);
    }
  });

  it('returns null when the index is before the minimum candle count', () => {
    const candles = makeCandles(20);
    // Index 5 is below minCandles=10 — not enough data to form a window.
    expect(extractRegimeFeatures(candles, CONFIG, 5)).toBeNull();
  });

  it('returns null when the index is out of bounds', () => {
    const candles = makeCandles(20);
    expect(extractRegimeFeatures(candles, CONFIG, 100)).toBeNull();
    expect(extractRegimeFeatures(candles, CONFIG, -1)).toBeNull();
  });
});