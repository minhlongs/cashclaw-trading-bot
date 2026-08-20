// alpha-router.test.ts — unit tests for Regime-Conditioned Alpha Router
//
// routeAlphas is a pure function with no I/O. It filters and ranks alpha
// signals based on the detected market regime. These tests cover every
// regime label, the confidence/direction thresholds, custom overrides,
// sort-by-confidence, and the topN cap.

import { describe, it, expect } from 'vitest';
import { routeAlphas } from './alpha-router';
import { RegimeLabel } from './types';
import type { AlphaSignal } from '../alpha/types';

// ── Signal factory ──────────────────────────────────────────────────────────

function makeSignal(overrides: Partial<AlphaSignal> = {}): AlphaSignal {
  return {
    name: 'test-alpha',
    source: 'indicator',
    direction: 'buy',
    confidence: 0.5,
    timestamp: 0,
    features: { features: [], computedAt: 0, symbol: 'BTC/USDT', lookback: 1 },
    metadata: {},
    ...overrides,
  };
}

// ── Test suite ──────────────────────────────────────────────────────────────

describe('routeAlphas', () => {
  it('returns empty array when no signals are provided', () => {
    expect(routeAlphas(RegimeLabel.RANGE, [])).toEqual([]);
  });

  it('SHOCK regime blocks all trading — returns empty regardless of signals', () => {
    const signals = [makeSignal({ confidence: 1 }), makeSignal({ confidence: 1 })];
    expect(routeAlphas(RegimeLabel.SHOCK, signals)).toEqual([]);
  });

  it('SHOCK blocks even a single high-confidence signal', () => {
    expect(routeAlphas(RegimeLabel.SHOCK, [makeSignal({ confidence: 1 })])).toEqual([]);
  });

  it('UNKNOWN regime passes all signals through unchanged (sorted by confidence)', () => {
    const signals = [
      makeSignal({ name: 'low', confidence: 0.2 }),
      makeSignal({ name: 'high', confidence: 0.9 }),
      makeSignal({ name: 'mid', confidence: 0.5 }),
    ];
    const result = routeAlphas(RegimeLabel.UNKNOWN, signals);
    expect(result).toHaveLength(3);
    expect(result[0].name).toBe('high');
    expect(result[1].name).toBe('mid');
    expect(result[2].name).toBe('low');
  });

  it('TREND_UP prefers buy signals and drops sell signals', () => {
    const signals = [
      makeSignal({ direction: 'buy', confidence: 0.4 }),
      makeSignal({ direction: 'sell', confidence: 1 }),
      makeSignal({ direction: 'buy', confidence: 0.6 }),
    ];
    const result = routeAlphas(RegimeLabel.TREND_UP, signals);
    expect(result).toHaveLength(2);
    expect(result.every((s) => s.direction === 'buy')).toBe(true);
    expect(result[0].confidence).toBe(0.6);
  });

  it('TREND_DOWN prefers sell signals and drops buy signals', () => {
    const signals = [
      makeSignal({ direction: 'sell', confidence: 0.4 }),
      makeSignal({ direction: 'buy', confidence: 1 }),
      makeSignal({ direction: 'sell', confidence: 0.7 }),
    ];
    const result = routeAlphas(RegimeLabel.TREND_DOWN, signals);
    expect(result).toHaveLength(2);
    expect(result.every((s) => s.direction === 'sell')).toBe(true);
    expect(result[0].confidence).toBe(0.7);
  });

  it('TREND_UP enforces the 0.3 confidence threshold', () => {
    const signals = [
      makeSignal({ direction: 'buy', confidence: 0.29 }),
      makeSignal({ direction: 'buy', confidence: 0.3 }),
      makeSignal({ direction: 'buy', confidence: 0.31 }),
    ];
    const result = routeAlphas(RegimeLabel.TREND_UP, signals);
    expect(result).toHaveLength(2);
    expect(result.map((s) => s.confidence)).toEqual([0.31, 0.3]);
  });

  it('RANGE requires higher confidence (0.5) than TREND_UP (0.3)', () => {
    const signals = [
      makeSignal({ direction: 'buy', confidence: 0.4 }),
      makeSignal({ direction: 'sell', confidence: 0.6 }),
    ];
    const result = routeAlphas(RegimeLabel.RANGE, signals);
    expect(result).toHaveLength(1);
    expect(result[0].direction).toBe('sell');
    expect(result[0].confidence).toBe(0.6);
  });

  it('HIGH_VOLATILITY only passes signals above 0.7 confidence', () => {
    const signals = [
      makeSignal({ direction: 'buy', confidence: 0.69 }),
      makeSignal({ direction: 'buy', confidence: 0.7 }),
      makeSignal({ direction: 'buy', confidence: 0.71 }),
    ];
    const result = routeAlphas(RegimeLabel.HIGH_VOLATILITY, signals);
    expect(result).toHaveLength(2);
    expect(result.map((s) => s.confidence)).toEqual([0.71, 0.7]);
  });

  it('LOW_VOLATILITY passes both directions with 0.4 threshold', () => {
    const signals = [
      makeSignal({ direction: 'buy', confidence: 0.4 }),
      makeSignal({ direction: 'sell', confidence: 0.4 }),
      makeSignal({ direction: 'hold', confidence: 0.9 }),
    ];
    const result = routeAlphas(RegimeLabel.LOW_VOLATILITY, signals);
    expect(result).toHaveLength(2);
    expect(result.every((s) => s.direction !== 'hold')).toBe(true);
  });

  it('topN caps the returned signals (default 10)', () => {
    const signals = Array.from({ length: 15 }, (_, i) =>
      makeSignal({ name: `s${i}`, confidence: (i + 1) / 16 }),
    );
    const result = routeAlphas(RegimeLabel.UNKNOWN, signals);
    expect(result).toHaveLength(10);
    // Top 10 by confidence, descending
    expect(result[0].confidence).toBe(15 / 16);
    expect(result[9].confidence).toBe(6 / 16);
  });

  it('custom topN overrides the default', () => {
    const signals = Array.from({ length: 5 }, (_, i) =>
      makeSignal({ name: `s${i}`, confidence: (i + 1) / 5 }),
    );
    const result = routeAlphas(RegimeLabel.UNKNOWN, signals, { topN: 2 });
    expect(result).toHaveLength(2);
    expect(result[0].confidence).toBe(1);
    expect(result[1].confidence).toBe(0.8);
  });

  it('confidenceOverrides override the per-regime threshold', () => {
    const signals = [
      makeSignal({ direction: 'buy', confidence: 0.4 }),
      makeSignal({ direction: 'buy', confidence: 0.9 }),
    ];
    const result = routeAlphas(RegimeLabel.TREND_UP, signals, {
      topN: 10,
      confidenceOverrides: { [RegimeLabel.TREND_UP]: 0.8 },
    });
    expect(result).toHaveLength(1);
    expect(result[0].confidence).toBe(0.9);
  });

  it('directionOverrides override the per-regime direction preference', () => {
    const signals = [
      makeSignal({ direction: 'buy', confidence: 0.9 }),
      makeSignal({ direction: 'sell', confidence: 0.9 }),
    ];
    // Even though TREND_UP normally prefers buy, force sell only
    const result = routeAlphas(RegimeLabel.TREND_UP, signals, {
      topN: 10,
      directionOverrides: { [RegimeLabel.TREND_UP]: ['sell'] },
    });
    expect(result).toHaveLength(1);
    expect(result[0].direction).toBe('sell');
  });

  it('signals below the confidence threshold are excluded even when direction matches', () => {
    const signals = [makeSignal({ direction: 'buy', confidence: 0.1 })];
    expect(routeAlphas(RegimeLabel.TREND_UP, signals)).toEqual([]);
  });

  it('hold direction is never preferred by any regime with explicit prefs', () => {
    // 'hold' is not in any REGIME_DIRECTION_PREFS, so it is filtered out
    // under every regime except UNKNOWN.
    const signals = [makeSignal({ direction: 'hold', confidence: 1 })];
    for (const regime of [
      RegimeLabel.TREND_UP,
      RegimeLabel.TREND_DOWN,
      RegimeLabel.RANGE,
      RegimeLabel.HIGH_VOLATILITY,
      RegimeLabel.LOW_VOLATILITY,
    ]) {
      expect(routeAlphas(regime, signals)).toEqual([]);
    }
    // But UNKNOWN passes it through
    expect(routeAlphas(RegimeLabel.UNKNOWN, signals)).toHaveLength(1);
  });

  it('returns a new array and does not mutate the input', () => {
    const signals = [makeSignal({ confidence: 0.5 })];
    const result = routeAlphas(RegimeLabel.UNKNOWN, signals);
    expect(result).not.toBe(signals);
    expect(signals).toHaveLength(1);
  });

  it('SHOCK takes precedence over UNKNOWN pass-through', () => {
    // Sanity check: SHOCK is checked before UNKNOWN, so SHOCK never leaks.
    const signals = [makeSignal({ confidence: 1 })];
    expect(routeAlphas(RegimeLabel.SHOCK, signals)).toEqual([]);
  });
});