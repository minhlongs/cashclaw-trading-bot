// Publication-lag tests for features 8/9 (realized_spread, price_impact):
// hand-computed values plus the null paths that keep the computer causal.
// Leakage invariants live in feature-computer-leakage.test.ts.

import { describe, expect, it } from 'vitest';
import { computeFeatureVectors } from './feature-computer';
import { makeSnapshot, makeTrades } from './test-fixtures';

describe('computeFeatureVectors — lagged features (publication lag h = 1)', () => {
  // t0: mid 100.5, spread 1, volume_delta +2. t1: mid 102.5.
  const series = [
    makeSnapshot(1000, [[100, 1]], [[101, 1]], makeTrades(1000, 3, 1)),
    makeSnapshot(2000, [[102, 1]], [[103, 1]]),
  ];

  it('realized_spread = (mid_after - mid_before) - spread = 1', () => {
    const vectors = computeFeatureVectors(series, 2000);
    expect(vectors[0].features.realized_spread).toBeCloseTo(1, 10);
  });

  it('price_impact = sign(delta) * (mid_after - mid_before)/mid_before', () => {
    const vectors = computeFeatureVectors(series, 2000);
    // delta > 0 → sign +1; (102.5 - 100.5) / 100.5
    expect(vectors[0].features.price_impact).toBeCloseTo(2 / 100.5, 10);
  });

  it('price_impact flips sign for negative volume_delta', () => {
    const negSeries = [
      makeSnapshot(1000, [[100, 1]], [[101, 1]], makeTrades(1000, 1, 3)), // delta -2
      makeSnapshot(2000, [[102, 1]], [[103, 1]]),
    ];
    const vectors = computeFeatureVectors(negSeries, 2000);
    expect(vectors[0].features.price_impact).toBeCloseTo(-2 / 100.5, 10);
  });

  it('price_impact is null when volume_delta is null (no trade batch)', () => {
    const noTrades = [
      makeSnapshot(1000, [[100, 1]], [[101, 1]], null),
      makeSnapshot(2000, [[102, 1]], [[103, 1]]),
    ];
    const vectors = computeFeatureVectors(noTrades, 2000);
    expect(vectors[0].features.price_impact).toBeNull();
    // realized_spread does not depend on trades — still emitted.
    expect(vectors[0].features.realized_spread).toBeCloseTo(1, 10);
  });

  it('realized_spread is null when the current book is crossed (mid undefined)', () => {
    const crossedFirst = [
      makeSnapshot(1000, [[101, 1]], [[100, 1]], makeTrades(1000, 3, 1)),
      makeSnapshot(2000, [[102, 1]], [[103, 1]]),
    ];
    const vectors = computeFeatureVectors(crossedFirst, 2000);
    expect(vectors[0].features.realized_spread).toBeNull();
    expect(vectors[0].features.price_impact).toBeNull();
  });

  it('the last snapshot never carries lagged features (no future mid)', () => {
    const vectors = computeFeatureVectors(series, 2000);
    expect(vectors[1].features.realized_spread).toBeNull();
    expect(vectors[1].features.price_impact).toBeNull();
  });
});
