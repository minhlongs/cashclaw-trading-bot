// Leakage invariance tests for the causal feature computer.
//
// (a) Truncation invariance — appending future snapshots never changes any
//     already-emitted feature value.
// (b) asOf monotonicity — a feature at t never appears while asOf < t + lag
//     (lag 0 for instant features, 1 snapshot for realized_spread/price_impact).
// (c) No forward-fill — a missing input at t leaves the feature null at t
//     even when t-1 and t+1 carry values.

import { describe, expect, it } from 'vitest';
import { MICROSTRUCTURE_FEATURE_NAMES } from './contracts';
import { computeFeatureVectors } from './feature-computer';
import { makeSnapshot as snap, makeTrades as trades } from './test-fixtures';
import type { ValidatedSnapshot } from './types';

/** 16 snapshots, 1000 ms apart, drifting mid and varying depth. */
function longSeries(): ValidatedSnapshot[] {
  const series: ValidatedSnapshot[] = [];
  for (let i = 0; i < 16; i++) {
    const ts = 1000 * (i + 1);
    const bidQty = 1 + (i % 3);
    const askQty = 1 + ((i + 1) % 3);
    series.push(
      snap(
        ts,
        [[100 + i, bidQty], [99 + i, bidQty]],
        [[101 + i, askQty], [102 + i, askQty]],
        trades(ts, 2 + (i % 2), 1 + (i % 3)),
      ),
    );
  }
  return series;
}

describe('(a) truncation invariance', () => {
  it('appending future snapshots never changes emitted feature values', () => {
    const full = longSeries();
    const asOf = full[9].timestamp; // everything up to index 9 is knowable

    const truncated = computeFeatureVectors(full.slice(0, 10), asOf);
    const extended = computeFeatureVectors(full, asOf);

    // Every feature emitted in the truncated run must be identical in the
    // extended run — future data (indices 10..15) cannot rewrite the past.
    for (let i = 0; i < truncated.length; i++) {
      for (const name of MICROSTRUCTURE_FEATURE_NAMES) {
        expect(extended[i].features[name], `feature ${name} at index ${i}`).toBe(
          truncated[i].features[name],
        );
      }
    }
  });

  it('holds for every truncation point, not just one', () => {
    const full = longSeries();
    const asOf = full[full.length - 1].timestamp;
    const reference = computeFeatureVectors(full, asOf);

    for (let cut = 2; cut < full.length; cut++) {
      const partial = computeFeatureVectors(full.slice(0, cut), asOf);
      for (let i = 0; i < partial.length; i++) {
        for (const name of MICROSTRUCTURE_FEATURE_NAMES) {
          // Every feature ALREADY EMITTED in the shorter series must keep its
          // exact value. A null slot may become non-null in the longer series
          // (its publication window closed with more data present) — that is
          // late publication, never a rewrite of an emitted value.
          const emitted = partial[i].features[name];
          if (emitted !== null) {
            expect(reference[i].features[name], `cut=${cut} idx=${i} ${name}`).toBe(
              emitted,
            );
          }
        }
      }
    }
  });
});

describe('(b) asOf monotonicity', () => {
  it('no feature at t appears while asOf < t (instant features, lag 0)', () => {
    const series = longSeries();
    const target = series[5];
    // asOf strictly before the target timestamp: nothing about t is knowable.
    const vectors = computeFeatureVectors(series, target.timestamp - 1);
    for (const name of MICROSTRUCTURE_FEATURE_NAMES) {
      expect(vectors[5].features[name], `feature ${name}`).toBeNull();
    }
  });

  it('instant features appear exactly once asOf >= t', () => {
    const series = longSeries();
    const target = series[5];
    const vectors = computeFeatureVectors(series, target.timestamp);
    expect(vectors[5].features.bid_ask_spread).not.toBeNull();
    expect(vectors[5].features.order_book_imbalance).not.toBeNull();
  });

  it('lagged features stay null while asOf < t + 1 snapshot (publication lag)', () => {
    const series = longSeries();
    const nextTs = series[6].timestamp;
    expect(series[5].timestamp).toBeLessThan(nextTs); // t precedes its future mid

    // asOf covers t but not the next snapshot: realized_spread/price_impact
    // need the future mid, so they must remain null.
    const before = computeFeatureVectors(series, nextTs - 1);
    expect(before[5].features.realized_spread).toBeNull();
    expect(before[5].features.price_impact).toBeNull();
    // Instant features at the same t are already available.
    expect(before[5].features.bid_ask_spread).not.toBeNull();

    // Once the next snapshot's timestamp <= asOf, the lagged values appear.
    const after = computeFeatureVectors(series, nextTs);
    expect(after[5].features.realized_spread).not.toBeNull();
    expect(after[5].features.price_impact).not.toBeNull();
  });

  it('the final snapshot never emits lagged features regardless of asOf', () => {
    const series = longSeries();
    const vectors = computeFeatureVectors(series, Number.MAX_SAFE_INTEGER);
    const last = vectors[vectors.length - 1];
    expect(last.features.realized_spread).toBeNull();
    expect(last.features.price_impact).toBeNull();
  });
});

describe('(c) null is never forward-filled', () => {
  it('a missing trade batch at t leaves trade features null at t only', () => {
    const series = longSeries();
    // Remove the trade batch at index 5; neighbours keep theirs.
    series[5] = { ...series[5], trades: null };

    const asOf = series[series.length - 1].timestamp;
    const vectors = computeFeatureVectors(series, asOf);

    for (const name of ['trade_imbalance', 'aggressive_volume', 'volume_delta'] as const) {
      expect(vectors[4].features[name], `${name} at t-1`).not.toBeNull();
      expect(vectors[5].features[name], `${name} at t`).toBeNull();
      expect(vectors[6].features[name], `${name} at t+1`).not.toBeNull();
    }
  });

  it('price_impact at t stays null when volume_delta(t) is null, even with a future mid', () => {
    const series = longSeries();
    series[5] = { ...series[5], trades: null };
    const asOf = series[series.length - 1].timestamp;
    const vectors = computeFeatureVectors(series, asOf);

    expect(vectors[5].features.price_impact).toBeNull();
    // realized_spread does not depend on trades and is still emitted.
    expect(vectors[5].features.realized_spread).not.toBeNull();
  });

  it('liquidity_shock at t uses only prior depths, never future ones', () => {
    // 12 varying-depth priors (mean 15), then a spike at index 12.
    // Truncating after the spike must not change the shock computed there.
    const series: ValidatedSnapshot[] = [];
    for (let i = 0; i < 12; i++) {
      const qty = i % 2 === 0 ? 5 : 10; // visible depth alternates 10 / 20
      series.push(snap(1000 + i, [[100, qty]], [[101, qty]]));
    }
    series.push(snap(1012, [[100, 50]], [[101, 50]])); // visible depth 100
    series.push(snap(1013, [[100, 5]], [[101, 5]])); // future — must not matter

    const withFuture = computeFeatureVectors(series, 1013);
    const withoutFuture = computeFeatureVectors(series.slice(0, 13), 1013);
    expect(withoutFuture[12].features.liquidity_shock).toBe(
      withFuture[12].features.liquidity_shock,
    );
    expect(withFuture[12].features.liquidity_shock).not.toBeNull();
  });
});
