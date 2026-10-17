import { describe, it, expect } from 'vitest';
import { evaluateHypothesis, numericValue } from './evaluator';
import type { IndicatorResult, IndicatorCandle } from '../indicator-types';
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

function wideSwingCandles(n: number, hi = 400, lo = 100): IndicatorCandle[] {
  const out: IndicatorCandle[] = [];
  for (let i = 0; i < n; i += 1) {
    const close = i % 2 === 0 ? hi : lo;
    out.push({
      timestamp: 1_000_000 + i * 60_000,
      open: close, high: close * 1.02, low: close * 0.98, close, volume: 1000,
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

describe('evaluateHypothesis — direction rules & numericValue', () => {
  it('returns null for an object value with no recognized numeric keys and extracts recognized keys', () => {
    const v = (x: unknown): IndicatorResult['value'] => x as IndicatorResult['value'];
    expect(numericValue(v({ unknown: 42 }))).toBeNull();
    expect(numericValue(v({ foo: 'bar' }))).toBeNull();
    expect(numericValue(v({}))).toBeNull();
    expect(numericValue(v({ rsi: 50 }))).toBe(50);
    expect(numericValue(v({ macd: -0.5 }))).toBe(-0.5);
    expect(numericValue(v({ histogram: 0.3 }))).toBe(0.3);
    expect(numericValue(v({ percentB: 1.2 }))).toBe(1.2);
    expect(numericValue(v({ middle: 100 }))).toBe(100);
  });

  it('classifies bollinger signals across hold, sell (>1), and buy (<-1) branches', () => {
    const holdHyp = buildHypothesis({
      indicatorSet: [
        { indicator: 'bollinger', lookback: 14, timeframe: '1h' },
        { indicator: 'rsi', lookback: 14, timeframe: '1h' },
      ],
    });
    expect(evaluateHypothesis(holdHyp, risingCandles(100)).totalSignals).toBe(1);

    const sellHyp = buildHypothesis({
      indicatorSet: [{ indicator: 'bollinger', lookback: 14, timeframe: '1h' }],
    });
    const sellCandles = risingCandles(100, 100, 2, 2);
    sellCandles[99] = { ...sellCandles[99], close: 1000 };
    expect(evaluateHypothesis(sellHyp, sellCandles).totalSignals).toBe(1);

    const buyHyp = buildHypothesis({ indicatorSet: [{ indicator: 'bollinger', lookback: 50, timeframe: '1h' }] });
    const buyCandles = risingCandles(120, 100, 2, 2);
    buyCandles[119] = { ...buyCandles[119], close: -10000 };
    expect(evaluateHypothesis(buyHyp, buyCandles).totalSignals).toBe(1);
  });

  it('classifies volume_zscore signals across hold, sell (>1), and buy (<-1) branches', () => {
    const holdHyp = buildHypothesis({
      indicatorSet: [
        { indicator: 'volume_zscore', lookback: 14, timeframe: '1h' },
        { indicator: 'rsi', lookback: 14, timeframe: '1h' },
      ],
    });
    expect(evaluateHypothesis(holdHyp, risingCandles(100)).totalSignals).toBe(1);

    const zHyp = buildHypothesis({
      indicatorSet: [{ indicator: 'volume_zscore', lookback: 14, timeframe: '1h' }],
    });
    const sellCandles = risingCandles(100);
    for (let i = 85; i < 100; i += 1) sellCandles[i] = { ...sellCandles[i], volume: 100 };
    sellCandles[99] = { ...sellCandles[99], volume: 100000 };
    expect(evaluateHypothesis(zHyp, sellCandles).totalSignals).toBe(1);

    const buyCandles = risingCandles(100);
    for (let i = 85; i < 100; i += 1) buyCandles[i] = { ...buyCandles[i], volume: 1000 };
    buyCandles[99] = { ...buyCandles[99], volume: 1 };
    expect(evaluateHypothesis(zHyp, buyCandles).totalSignals).toBe(1);
  });

  it('classifies rsi buy (<30), atr sell/hold, realized_volatility, and defaultDirection branches', () => {
    const rsiHyp = buildHypothesis({ indicatorSet: [{ indicator: 'rsi', lookback: 14, timeframe: '1h' }] });
    const rRsi = evaluateHypothesis(rsiHyp, fallingCandles(100, 200, 1, 1));
    expect(rRsi.totalSignals).toBe(1);

    const atrHyp = buildHypothesis({ indicatorSet: [{ indicator: 'atr', lookback: 14, timeframe: '1h' }] });
    expect(evaluateHypothesis(atrHyp, highVolCandles(100)).totalSignals).toBe(1);
    expect(evaluateHypothesis(atrHyp, lowVolCandles(100)).totalSignals).toBe(0);

    const rvHyp = buildHypothesis({ indicatorSet: [{ indicator: 'realized_volatility', lookback: 14, timeframe: '1h' }] });
    expect(evaluateHypothesis(rvHyp, wideSwingCandles(100)).totalSignals).toBe(1);

    const zeroHyp = buildHypothesis({
      indicatorSet: [
        { indicator: 'returns', lookback: 14, timeframe: '1h' },
        { indicator: 'macd', lookback: 14, timeframe: '1h' },
      ],
    });
    expect(evaluateHypothesis(zeroHyp, flatCandles(100)).totalSignals).toBe(1);

    const defaultHyp = buildHypothesis({
      indicatorSet: [
        { indicator: 'distance_from_ma', lookback: 14, timeframe: '1h' },
        { indicator: 'rsi', lookback: 14, timeframe: '1h' },
      ],
    });
    expect(evaluateHypothesis(defaultHyp, risingCandles(100)).totalSignals).toBe(1);
  });
});
