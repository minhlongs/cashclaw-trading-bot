import { describe, it, expect } from 'vitest';
import { evaluateHypothesis } from './evaluator';
import type { IndicatorCandle } from '../indicator-types';
import type { AlphaHypothesis } from './types';
import type { BarrierConfig } from '../labeling';

const BARRIER: BarrierConfig = { takeProfitPct: 0.05, stopLossPct: 0.02, maxHoldingMs: 60_000 };

function buildHypothesis(overrides: Partial<AlphaHypothesis> = {}): AlphaHypothesis {
  return {
    id: 'h-eval-1',
    name: 'Eval Test',
    description: 'A hypothesis for evaluation coverage',
    indicatorSet: [{ indicator: 'rsi', lookback: 14, timeframe: '1h' }],
    combineMethod: 'voting',
    regimeFilter: [],
    barrierConfig: BARRIER,
    optimizerMethod: 'equal_weight',
    confidence: 0.5,
    createdAt: '2026-08-29T00:00:00Z',
    ...overrides,
  };
}

function risingCandles(n: number, base = 100, step = 2, wig = 2): IndicatorCandle[] {
  const out: IndicatorCandle[] = [];
  for (let i = 0; i < n; i += 1) {
    const close = base + i * step + (i % 2 === 0 ? wig : -wig);
    out.push({
      timestamp: 1_000_000 + i * 60_000,
      open: close - 0.5, high: close + 0.5, low: close - 0.5, close, volume: 1000,
    });
  }
  return out;
}

function fallingCandles(n: number, base = 200, step = 1, wig = 1): IndicatorCandle[] {
  const out: IndicatorCandle[] = [];
  for (let i = 0; i < n; i += 1) {
    const close = base - i * step + (i % 2 === 0 ? wig : -wig);
    out.push({
      timestamp: 1_000_000 + i * 60_000,
      open: close + 0.5, high: close + 0.5, low: close - 0.5, close, volume: 1000,
    });
  }
  return out;
}

function flatCandles(n: number, base = 100, amp = 0.5): IndicatorCandle[] {
  const out: IndicatorCandle[] = [];
  for (let i = 0; i < n; i += 1) {
    const close = base + (i % 2 === 0 ? amp : -amp);
    out.push({
      timestamp: 1_000_000 + i * 60_000,
      open: close, high: close + 0.01, low: close - 0.01, close, volume: 1000,
    });
  }
  return out;
}

function lowVolCandles(n: number): IndicatorCandle[] {
  const out: IndicatorCandle[] = [];
  for (let i = 0; i < n; i += 1) {
    const close = 100 + (i % 2 === 0 ? 0.0001 : -0.0001);
    out.push({
      timestamp: 1_000_000 + i * 60_000,
      open: close, high: close + 0.001, low: close - 0.001, close, volume: 1000,
    });
  }
  return out;
}

function highVolCandles(n: number): IndicatorCandle[] {
  const out: IndicatorCandle[] = [];
  for (let i = 0; i < n; i += 1) {
    const close = i % 2 === 0 ? 100 : 50;
    out.push({
      timestamp: 1_000_000 + i * 60_000,
      open: close, high: close * 1.02, low: close * 0.98, close, volume: 1000,
    });
  }
  return out;
}

describe('evaluateHypothesis — regime classification & barrier labeling', () => {
  it('returns an empty evaluation when there are fewer than 20 candles', () => {
    const hyp = buildHypothesis();
    const r = evaluateHypothesis(hyp, risingCandles(19));
    expect(r.hypothesisId).toBe(hyp.id);
    expect(r.totalSignals).toBe(0);
    expect(r.passRate).toBe(0);
    expect(r.winRate).toBe(0);
  });

  it('returns an empty evaluation when no indicator in the set resolves', () => {
    const hyp = buildHypothesis({ indicatorSet: [{ indicator: 'unknownIndicator', lookback: 14 }] });
    const r = evaluateHypothesis(hyp, risingCandles(60));
    expect(r.totalSignals).toBe(0);
    expect(Object.keys(r.regimePerformance)).toHaveLength(0);
  });

  it('returns an empty evaluation when the combined direction is hold', () => {
    const hyp = buildHypothesis();
    const r = evaluateHypothesis(hyp, flatCandles(60));
    expect(r.totalSignals).toBe(0);
  });

  it('produces a populated evaluation with a regime key', () => {
    const hyp = buildHypothesis();
    const r = evaluateHypothesis(hyp, risingCandles(100));
    expect(r.totalSignals).toBe(1);
    expect(r.avgConfidence).toBeGreaterThan(0);
    expect(Object.keys(r.regimePerformance)).toHaveLength(1);
  });

  it('classifies rising, falling, flat, high-vol, and low-vol markets', () => {
    expect(Object.keys(evaluateHypothesis(buildHypothesis(), risingCandles(100, 100, 2, 2)).regimePerformance)[0]).toBe('TREND_UP');
    expect(Object.keys(evaluateHypothesis(buildHypothesis({ indicatorSet: [{ indicator: 'rsi', lookback: 14 }] }), fallingCandles(100, 200, 1, 1)).regimePerformance)[0]).toBe('TREND_DOWN');
    expect(Object.keys(evaluateHypothesis(buildHypothesis({ indicatorSet: [{ indicator: 'macd', lookback: 14 }] }), flatCandles(100)).regimePerformance)[0]).toBe('RANGE');
    expect(Object.keys(evaluateHypothesis(buildHypothesis({ indicatorSet: [{ indicator: 'macd', lookback: 14 }] }), highVolCandles(100)).regimePerformance)[0]).toBe('HIGH_VOLATILITY');
    expect(Object.keys(evaluateHypothesis(buildHypothesis({ indicatorSet: [{ indicator: 'macd', lookback: 14 }] }), lowVolCandles(100)).regimePerformance)[0]).toBe('LOW_VOLATILITY');
  });

  it('returns UNKNOWN regime when the window is too small to classify', () => {
    const r = evaluateHypothesis(buildHypothesis(), risingCandles(100), 1);
    expect(Object.keys(r.regimePerformance)[0]).toBe('UNKNOWN');
  });

  it('uses the null-confidence default when an indicator resolves to null', () => {
    const hyp = buildHypothesis({
      indicatorSet: [
        { indicator: 'sma', lookback: 200, timeframe: '1h' },
        { indicator: 'rsi', lookback: 14, timeframe: '1h' },
      ],
    });
    const r = evaluateHypothesis(hyp, risingCandles(100));
    expect(r.totalSignals).toBe(1);
    expect(r.avgConfidence).toBeGreaterThan(0);
  });

  it('returns a null label when the barrier window is too short', () => {
    const hyp = buildHypothesis();
    const r = evaluateHypothesis(hyp, risingCandles(100));
    expect(r.passRate).toBe(0);
    expect(r.winRate).toBe(0);
  });

  it('labels a take-profit hit (label === 1)', () => {
    const hyp = buildHypothesis({
      barrierConfig: { takeProfitPct: 0.05, stopLossPct: 0.02, maxHoldingMs: 120_000 },
    });
    const candles = risingCandles(99, 100, 2, 2);
    candles.push({ timestamp: 2_000_000, open: 100, high: 106, low: 99, close: 100, volume: 1000 });
    candles.push({ timestamp: 2_000_060, open: 100, high: 106, low: 99, close: 100, volume: 1000 });
    const r = evaluateHypothesis(hyp, candles);
    expect(r.passRate).toBe(1);
    expect(r.winRate).toBe(1);
  });

  it('labels a stop-loss hit (label === -1)', () => {
    const hyp = buildHypothesis({
      barrierConfig: { takeProfitPct: 0.05, stopLossPct: 0.02, maxHoldingMs: 120_000 },
    });
    const candles = risingCandles(99, 100, 2, 2);
    candles.push({ timestamp: 2_000_000, open: 100, high: 101, low: 99, close: 100, volume: 1000 });
    candles.push({ timestamp: 2_000_060, open: 100, high: 101, low: 97, close: 100, volume: 1000 });
    const r = evaluateHypothesis(hyp, candles);
    expect(r.passRate).toBe(1);
    expect(r.winRate).toBe(0);
  });
});
