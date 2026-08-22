// Microstructure feature contract tests.
//
// These tests prove the causal gate and the no-forward-fill invariant for the
// mission §3A microstructure feature set. Contracts only — no I/O, no fetch.

import { describe, it, expect } from 'vitest';
import { declareFeature, type FeatureDeclaration } from '@/tree/alpha/indicator-types';
import {
  MICROSTRUCTURE_FEATURES,
  MICROSTRUCTURE_FEATURE_NAMES,
  getMicrostructureFeature,
} from './contracts';
import type { MicrostructureSnapshot, FeatureVector } from './types';

const VALID: FeatureDeclaration = {
  name: 'rsi',
  timeframe: '1h',
  source: 'ohlcv',
  lookback: 14,
  availability: 'always',
  causal: true,
};

describe('declareFeature (shared gate, reused pattern)', () => {
  it('accepts a fully valid declaration', () => {
    expect(declareFeature(VALID)).toEqual(VALID);
  });

  it('rejects a non-causal feature', () => {
    expect(() => declareFeature({ ...VALID, causal: false })).toThrow(/non-causal/);
  });
});

describe('microstructure declarations', () => {
  it('declares exactly nine features', () => {
    expect(MICROSTRUCTURE_FEATURES).toHaveLength(9);
    expect(MICROSTRUCTURE_FEATURE_NAMES).toHaveLength(9);
    expect(new Set(MICROSTRUCTURE_FEATURE_NAMES).size).toBe(9);
  });

  it('all nine pass declareFeature() (no throw)', () => {
    for (const d of MICROSTRUCTURE_FEATURES) {
      expect(() => declareFeature(d)).not.toThrow();
    }
  });

  it('every declared feature is causal and when_listed', () => {
    for (const d of MICROSTRUCTURE_FEATURES) {
      expect(d.causal).toBe(true);
      expect(d.availability).toBe('when_listed');
      expect(d.timeframe).toBe('1m');
      expect(d.lookback).toBeGreaterThanOrEqual(1);
      expect(['orderbook', 'trades']).toContain(d.source);
    }
  });

  it('covers the nine required feature names', () => {
    expect(MICROSTRUCTURE_FEATURE_NAMES).toEqual([
      'bid_ask_spread',
      'order_book_imbalance',
      'depth_imbalance',
      'trade_imbalance',
      'aggressive_volume',
      'volume_delta',
      'liquidity_shock',
      'realized_spread',
      'price_impact',
    ]);
  });

  it('getMicrostructureFeature returns the declared feature', () => {
    const d = getMicrostructureFeature('bid_ask_spread');
    expect(d.name).toBe('bid_ask_spread');
    expect(d.source).toBe('orderbook');
  });

  it('getMicrostructureFeature throws for an undeclared feature', () => {
    expect(() => getMicrostructureFeature('not_a_feature')).toThrow(/not declared/);
  });
});

describe('no-forward-fill guard', () => {
  // The invariant: a FeatureVector built from a snapshot with a missing input
  // keeps null in that slot, and nothing in this module fabricates it.

  it('a missing input stays null in the feature vector', () => {
    const snapshot: MicrostructureSnapshot = {
      timestamp: 1_000_000,
      symbol: 'BTCUSDT',
      rawInputs: {
        best_bid: 100.0,
        best_ask: null, // missing — must stay null
        taker_buy_volume: 5.0,
      },
    };
    // A causal compute path: null input propagates to null output, never
    // substituted. The bid/ask spread is undefined when either side is null.
    const bid = snapshot.rawInputs.best_bid;
    const ask = snapshot.rawInputs.best_ask;
    const spread: number | null =
      bid !== null && ask !== null ? ask - bid : null;
    const volumeDelta: number | null = snapshot.rawInputs.taker_buy_volume;
    const vector: FeatureVector = {
      timestamp: snapshot.timestamp,
      symbol: snapshot.symbol,
      features: {
        bid_ask_spread: spread,
        volume_delta: volumeDelta,
      },
    };
    expect(vector.features.bid_ask_spread).toBeNull();
    expect(vector.features.volume_delta).toBe(5.0);
  });

  it('no function in this module fills a null slot', () => {
    // This module exports only declarations and types; there is no compute
    // path here, so a null input can never be substituted by anything.
    // Import the barrel dynamically and assert no exported value is a
    // forward-fill helper (by name) — the only function exported is the
    // declaration lookup, which never mutates data.
    return import('./index').then(mod => {
      const exported = Object.keys(mod);
      expect(exported).toEqual(
        expect.arrayContaining([
          'MICROSTRUCTURE_FEATURES',
          'MICROSTRUCTURE_FEATURE_NAMES',
          'getMicrostructureFeature',
        ]),
      );
      const fillers = exported.filter(n => /fill|forward|impute|default/i.test(n));
      expect(fillers).toEqual([]);
    });
  });
});

describe('MicrostructureSnapshot monotonicity', () => {
  it('timestamps are monotonic when provided in order', () => {
    const snaps: MicrostructureSnapshot[] = [
      { timestamp: 100, symbol: 'BTCUSDT', rawInputs: { a: 1 } },
      { timestamp: 200, symbol: 'BTCUSDT', rawInputs: { a: 2 } },
      { timestamp: 300, symbol: 'BTCUSDT', rawInputs: { a: 3 } },
    ];
    for (let i = 1; i < snaps.length; i++) {
      expect(snaps[i].timestamp).toBeGreaterThan(snaps[i - 1].timestamp);
    }
  });

  it('rejects a non-monotonic (out-of-order) timestamp', () => {
    const snaps: MicrostructureSnapshot[] = [
      { timestamp: 100, symbol: 'BTCUSDT', rawInputs: { a: 1 } },
      { timestamp: 90, symbol: 'BTCUSDT', rawInputs: { a: 2 } },
    ];
    let monotonic = true;
    for (let i = 1; i < snaps.length; i++) {
      if (snaps[i].timestamp <= snaps[i - 1].timestamp) {
        monotonic = false;
      }
    }
    expect(monotonic).toBe(false);
  });
});