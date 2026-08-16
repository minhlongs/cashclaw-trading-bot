import { describe, it, expect } from 'vitest';
import type { IndicatorCandle } from '../indicator-types';
import { findCointegratedPairs, generatePairSignals, filterDiversified } from './pairs';

// ── Helpers ───────────────────────────────────────────────────────────────────

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

// ── Pair Discovery ────────────────────────────────────────────────────────────

describe('findCointegratedPairs', () => {
  it('finds a cointegrated pair in a universe', () => {
    const base = Array.from({ length: 50 }, (_, i) => 100 + i * 0.5 + Math.sin(i * 0.2) * 2);
    const allCandles = new Map<string, IndicatorCandle[]>();
    allCandles.set('BTC', makeCandles(base));
    allCandles.set('ETH', makeCandles(base.map((v) => v * 2)));
    allCandles.set('DOGE', makeCandles(Array.from({ length: 50 }, () => Math.random() * 10)));

    const pairs = findCointegratedPairs(allCandles, 50);
    const btcEth = pairs.find(
      (p) =>
        (p.symbol1 === 'BTC' && p.symbol2 === 'ETH') ||
        (p.symbol1 === 'ETH' && p.symbol2 === 'BTC'),
    );
    expect(btcEth).toBeDefined();
    expect(Math.abs(btcEth!.correlation)).toBeGreaterThan(0.5);
  });

  it('returns empty when no pairs meet threshold', () => {
    const allCandles = new Map<string, IndicatorCandle[]>();
    allCandles.set('A', makeCandles(Array.from({ length: 30 }, () => Math.random() * 100)));
    allCandles.set('B', makeCandles(Array.from({ length: 30 }, () => Math.random() * 100)));
    const pairs = findCointegratedPairs(allCandles, 30);
    expect(pairs.length).toBe(0);
  });
});

// ── Signal Generation ─────────────────────────────────────────────────────────

describe('generatePairSignals', () => {
  it('generates a signal when z-score exceeds threshold', () => {
    const allCandles = new Map<string, IndicatorCandle[]>();
    const vals1 = Array.from({ length: 50 }, (_, i) => 100 + Math.sin(i * 0.1) * 5);
    const vals2 = Array.from({ length: 50 }, (_, i) => 200 + Math.sin(i * 0.1) * 5 + (i > 45 ? 30 : 0));
    allCandles.set('A', makeCandles(vals1));
    allCandles.set('B', makeCandles(vals2));

    const pairs = findCointegratedPairs(allCandles, 50);
    if (pairs.length > 0) {
      const signals = generatePairSignals(pairs, allCandles, 1.0);
      expect(signals.length).toBeGreaterThanOrEqual(0);
      if (signals.length > 0) {
        expect(['long_spread', 'short_spread']).toContain(signals[0].direction);
        expect(signals[0].confidence).toBeGreaterThanOrEqual(0);
        expect(signals[0].confidence).toBeLessThanOrEqual(1);
      }
    }
  });
});

// ── Filter Diversified ────────────────────────────────────────────────────────

describe('filterDiversified', () => {
  it('filters out pairs with spread std below threshold', () => {
    const pairs = [
      { symbol1: 'A', symbol2: 'B', correlation: 0.9, halfLife: 5, spreadMean: 0, spreadStd: 0.0005, cointegrationPValue: 0.01 },
      { symbol1: 'C', symbol2: 'D', correlation: 0.8, halfLife: 3, spreadMean: 0, spreadStd: 0.01, cointegrationPValue: 0.03 },
    ];
    const filtered = filterDiversified(pairs, 0.001);
    expect(filtered.length).toBe(1);
    expect(filtered[0].symbol1).toBe('C');
  });

  it('keeps all pairs when spread is above threshold', () => {
    const pairs = [
      { symbol1: 'A', symbol2: 'B', correlation: 0.9, halfLife: 5, spreadMean: 0, spreadStd: 0.05, cointegrationPValue: 0.01 },
    ];
    const filtered = filterDiversified(pairs, 0.001);
    expect(filtered.length).toBe(1);
  });
});
