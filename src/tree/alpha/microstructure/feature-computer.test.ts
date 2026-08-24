// Feature computer tests: hand-computed expected values for each of the nine
// contracts plus the null paths. Leakage invariants live in
// feature-computer-leakage.test.ts; lagged features in
// feature-computer-lagged.test.ts.

import { describe, expect, it } from 'vitest';
import { MICROSTRUCTURE_FEATURE_NAMES } from './contracts';
import { computeFeatureVectors } from './feature-computer';
import { SYMBOL, makeSnapshot, makeTrades } from './test-fixtures';

describe('computeFeatureVectors — instant features (hand-computed)', () => {
  it('computes bid_ask_spread = best_ask - best_bid', () => {
    const vectors = computeFeatureVectors(
      [makeSnapshot(1000, [[100, 1]], [[101, 1]])],
      1000,
    );
    expect(vectors[0].features.bid_ask_spread).toBe(1);
  });

  it('bid_ask_spread is null for a crossed book', () => {
    const vectors = computeFeatureVectors(
      [makeSnapshot(1000, [[101, 1]], [[100, 1]])],
      1000,
    );
    expect(vectors[0].features.bid_ask_spread).toBeNull();
  });

  it('order_book_imbalance on best quotes: (3-1)/(3+1) = 0.5', () => {
    const vectors = computeFeatureVectors(
      [makeSnapshot(1000, [[100, 3]], [[101, 1]])],
      1000,
    );
    expect(vectors[0].features.order_book_imbalance).toBeCloseTo(0.5, 10);
  });

  it('depth_imbalance across all levels: (6-2)/(6+2) = 0.5', () => {
    const vectors = computeFeatureVectors(
      [makeSnapshot(1000, [[100, 4], [99, 2]], [[101, 1], [102, 1]])],
      1000,
    );
    expect(vectors[0].features.depth_imbalance).toBeCloseTo(0.5, 10);
  });

  it('computes trade features from a complete batch (buy 3, sell 1)', () => {
    const vectors = computeFeatureVectors(
      [makeSnapshot(1000, [[100, 1]], [[101, 1]], makeTrades(1000, 3, 1))],
      1000,
    );
    const f = vectors[0].features;
    expect(f.trade_imbalance).toBeCloseTo(0.5, 10); // (3-1)/(3+1)
    expect(f.aggressive_volume).toBe(4); // 3 + 1
    expect(f.volume_delta).toBe(2); // 3 - 1
  });

  it('trade features are null when the batch is incomplete', () => {
    const vectors = computeFeatureVectors(
      [makeSnapshot(1000, [[100, 1]], [[101, 1]], makeTrades(1000, 3, 1, false))],
      1000,
    );
    const f = vectors[0].features;
    expect(f.trade_imbalance).toBeNull();
    expect(f.aggressive_volume).toBeNull();
    expect(f.volume_delta).toBeNull();
  });

  it('trade features are null when no trade batch covers the snapshot', () => {
    const vectors = computeFeatureVectors(
      [makeSnapshot(1000, [[100, 1]], [[101, 1]], null)],
      1000,
    );
    expect(vectors[0].features.trade_imbalance).toBeNull();
    expect(vectors[0].features.aggressive_volume).toBeNull();
    expect(vectors[0].features.volume_delta).toBeNull();
  });

  it('trade_imbalance is null when total volume is zero', () => {
    const vectors = computeFeatureVectors(
      [makeSnapshot(1000, [[100, 1]], [[101, 1]], makeTrades(1000, 0, 0))],
      1000,
    );
    expect(vectors[0].features.trade_imbalance).toBeNull();
    expect(vectors[0].features.aggressive_volume).toBe(0);
    expect(vectors[0].features.volume_delta).toBe(0);
  });
});

describe('computeFeatureVectors — liquidity_shock (k = 12)', () => {
  // 12 prior snapshots with visible depth alternating 10 / 20:
  // mean = 15, population sd = 5. Current depth 25 → z = (25-15)/5 = 2.
  function shockSeries() {
    const series = [];
    for (let i = 0; i < 12; i++) {
      const qty = i % 2 === 0 ? 5 : 10; // total depth 10 or 20
      series.push(makeSnapshot(1000 + i, [[100, qty]], [[101, qty]]));
    }
    series.push(makeSnapshot(1012, [[100, 12.5]], [[101, 12.5]])); // depth 25
    return series;
  }

  it('emits the z-score once 12 prior snapshots exist', () => {
    const vectors = computeFeatureVectors(shockSeries(), 1012);
    expect(vectors[12].features.liquidity_shock).toBeCloseTo(2, 10);
  });

  it('is null before 12 prior snapshots exist (no fill)', () => {
    const vectors = computeFeatureVectors(shockSeries().slice(0, 12), 1011);
    for (const v of vectors) {
      expect(v.features.liquidity_shock).toBeNull();
    }
  });

  it('is null when the prior-depth history is constant (sd = 0)', () => {
    const series = [];
    for (let i = 0; i < 13; i++) {
      series.push(makeSnapshot(1000 + i, [[100, 5]], [[101, 5]]));
    }
    const vectors = computeFeatureVectors(series, 1012);
    expect(vectors[12].features.liquidity_shock).toBeNull();
  });
});

describe('computeFeatureVectors — output contract', () => {
  it('every vector carries exactly the nine declared feature keys, in order', () => {
    const vectors = computeFeatureVectors(
      [makeSnapshot(1000, [[100, 1]], [[101, 1]], makeTrades(1000, 1, 1))],
      1000,
    );
    expect(Object.keys(vectors[0].features)).toEqual([
      ...MICROSTRUCTURE_FEATURE_NAMES,
    ]);
  });

  it('preserves timestamp and symbol on every vector', () => {
    const vectors = computeFeatureVectors(
      [makeSnapshot(1000, [[100, 1]], [[101, 1]])],
      1000,
    );
    expect(vectors[0].timestamp).toBe(1000);
    expect(vectors[0].symbol).toBe(SYMBOL);
  });

  it('returns an empty array for an empty series', () => {
    expect(computeFeatureVectors([], 1000)).toEqual([]);
  });

  it('is deterministic: same series + asOf → identical output', () => {
    const series = [
      makeSnapshot(1000, [[100, 1]], [[101, 1]], makeTrades(1000, 3, 1)),
      makeSnapshot(2000, [[102, 1]], [[103, 1]]),
    ];
    const a = computeFeatureVectors(series, 2000);
    const b = computeFeatureVectors(series, 2000);
    expect(a).toEqual(b);
  });
});
