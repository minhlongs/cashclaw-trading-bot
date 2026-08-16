// Baseline strategy runner tests
// Verifies each baseline produces a valid EvaluationReport

import { describe, expect, it } from 'vitest';
import { runBaseline } from './runner';
import type { BaselineConfig } from './types';
import type { Candle } from '@/forest/backtest/ohlcv';

// ── Helpers ──────────────────────────────────────────────

function makeCandles(n: number, start = 100, drift = 0.5): Candle[] {
  const out: Candle[] = [];
  let price = start;
  for (let i = 0; i < n; i++) {
    const close = price + (i % 3 === 0 ? drift : -drift * 0.5);
    out.push({
      timestamp: Date.now() + i * 3_600_000,
      open: price, high: price + 1, low: price - 1, close, volume: 1000,
    });
    price = close;
  }
  return out;
}

function cfg(strategy: BaselineConfig['strategy']): BaselineConfig {
  return { strategy, symbol: 'BTCUSDT', timeframe: '1h', stressMode: 'normal', feePct: 0.0005, slipPct: 0.0005 };
}

// ── Tests ────────────────────────────────────────────────

describe('runBaseline - buy_hold', () => {
  it('produces a valid report with one trade', () => {
    const report = runBaseline(makeCandles(100), cfg('buy_hold'));
    expect(report.experimentId).toContain('buy_hold');
    expect(report.numTrades).toBe(1);
    expect(report.netPnl).toBeDefined();
    expect(report.fees).toBeGreaterThanOrEqual(0);
  });
});

describe('runBaseline - random_entry', () => {
  it('produces a valid report with multiple trades', () => {
    const report = runBaseline(makeCandles(200), cfg('random_entry'));
    expect(report.experimentId).toContain('random_entry');
    expect(report.numTrades).toBeGreaterThan(0);
    expect(report.winRate).toBeGreaterThanOrEqual(0);
  });

  it('is deterministic with same candle data', () => {
    const candles = makeCandles(150);
    const r1 = runBaseline(candles, cfg('random_entry'));
    const r2 = runBaseline(candles, cfg('random_entry'));
    expect(r1.netPnl).toBe(r2.netPnl);
    expect(r1.numTrades).toBe(r2.numTrades);
  });
});

describe('runBaseline - simple_momentum', () => {
  it('produces a valid report', () => {
    const report = runBaseline(makeCandles(100), cfg('simple_momentum'));
    expect(report.experimentId).toContain('simple_momentum');
    expect(report.numTrades).toBeGreaterThanOrEqual(0);
    expect(report.fees).toBeGreaterThanOrEqual(0);
  });
});

describe('runBaseline - simple_mean_reversion', () => {
  it('produces a valid report', () => {
    const report = runBaseline(makeCandles(100), cfg('simple_mean_reversion'));
    expect(report.experimentId).toContain('simple_mean_reversion');
    expect(report.numTrades).toBeGreaterThanOrEqual(0);
    expect(report.maxDrawdown).toBeGreaterThanOrEqual(0);
  });
});

describe('runBaseline - edge cases', () => {
  it('returns empty report for too few candles', () => {
    const report = runBaseline(makeCandles(1), cfg('buy_hold'));
    expect(report.numTrades).toBe(0);
    expect(report.netPnl).toBe(0);
  });

  it('applies stressMode multiplier to fees', () => {
    const normal = runBaseline(makeCandles(100), cfg('random_entry'));
    const conservative: BaselineConfig = { ...cfg('random_entry'), stressMode: 'conservative' };
    const adv = runBaseline(makeCandles(100), conservative);
    expect(adv.fees).toBeGreaterThanOrEqual(normal.fees);
  });
});
