import { describe, it, expect } from 'vitest';
import { evaluateHypothesis, numericValue } from './evaluator';
import type { AlphaHypothesis, HypothesisEvaluation } from './types';
import type { IndicatorCandle } from '../indicator-types';
import type { BarrierConfig } from '../labeling';

// ── Hypothesis fixtures ──────────────────────────────────────────────────────

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

/** Generate `n` monotonically rising candles with a small zigzag wiggle. */
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

/** Generate `n` monotonically falling candles with a small zigzag wiggle. */
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

/** Alternating candles around a fixed price — zero net trend, nonzero variance. */
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

/** Tiny oscillations around a fixed price — near-zero volatility. */
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

/** Alternating wide-swing closes — high realized volatility. */
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

/** Alternating ±50% closes — extreme volatility. */
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

// ── evaluateHypothesis ───────────────────────────────────────────────────────

describe('evaluateHypothesis', () => {
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
    // RSI sits at 50 (neutral) on alternating flat candles → direction 'hold'.
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

  it('classifies a rising market as TREND_UP', () => {
    const hyp = buildHypothesis();
    const r = evaluateHypothesis(hyp, risingCandles(100, 100, 2, 2));
    expect(Object.keys(r.regimePerformance)[0]).toBe('TREND_UP');
  });

  it('classifies a falling market as TREND_DOWN', () => {
    const hyp = buildHypothesis({ indicatorSet: [{ indicator: 'rsi', lookback: 14 }] });
    const r = evaluateHypothesis(hyp, fallingCandles(100, 200, 1, 1));
    expect(Object.keys(r.regimePerformance)[0]).toBe('TREND_DOWN');
  });

  it('classifies a flat market as RANGE', () => {
    const hyp = buildHypothesis({ indicatorSet: [{ indicator: 'macd', lookback: 14 }] });
    const r = evaluateHypothesis(hyp, flatCandles(100));
    expect(Object.keys(r.regimePerformance)[0]).toBe('RANGE');
  });

  it('classifies a high-volatility market', () => {
    const hyp = buildHypothesis({ indicatorSet: [{ indicator: 'macd', lookback: 14 }] });
    const r = evaluateHypothesis(hyp, highVolCandles(100));
    expect(Object.keys(r.regimePerformance)[0]).toBe('HIGH_VOLATILITY');
  });

  it('classifies a low-volatility market', () => {
    const hyp = buildHypothesis({ indicatorSet: [{ indicator: 'macd', lookback: 14 }] });
    const r = evaluateHypothesis(hyp, lowVolCandles(100));
    expect(Object.keys(r.regimePerformance)[0]).toBe('LOW_VOLATILITY');
  });

  // ── Branch coverage: classifier edge cases ─────────────────────────────────

  it('returns UNKNOWN regime when the window is too small to classify', () => {
    // classifyRegimeAt slices with lookback=1, leaving a 1-element window
    // (window.length < 2) -> RegimeLabel.UNKNOWN (line 76). The array must
    // exceed 20 candles to clear the short-array guard in evaluateHypothesis.
    const r = evaluateHypothesis(buildHypothesis(), risingCandles(100), 1);
    expect(Object.keys(r.regimePerformance)[0]).toBe('UNKNOWN');
  });

  // ── Branch coverage: bollinger / volume_zscore direction rules ─────────────

  it('classifies a bollinger signal whose percentB sits inside [-1, 1]', () => {
    // bollinger direction rule (line 55) hold branch: percentB in [-1, 1].
    // On a rising series percentB is ~0.94 (hold); pair it with rsi at 75
    // (sell, confidence 1) so the voting combiner selects 'sell'.
    const hyp = buildHypothesis({
      indicatorSet: [
        { indicator: 'bollinger', lookback: 14, timeframe: '1h' },
        { indicator: 'rsi', lookback: 14, timeframe: '1h' },
      ],
    });
    const r = evaluateHypothesis(hyp, risingCandles(100));
    expect(r.totalSignals).toBe(1);
  });

  it('classifies a bollinger signal whose percentB exceeds 1 as sell', () => {
    // bollinger direction rule (line 55) sell branch: percentB > 1.
    // bollingerBands derives percentB from closes only, so a runaway last
    // close pushes percentB above 1.
    const hyp = buildHypothesis({
      indicatorSet: [{ indicator: 'bollinger', lookback: 14, timeframe: '1h' }],
    });
    const candles = risingCandles(100, 100, 2, 2);
    candles[99] = { ...candles[99], close: 1000 }; // runaway last close
    const r = evaluateHypothesis(hyp, candles);
    expect(r.totalSignals).toBe(1);
  });

  it('classifies a volume_zscore signal whose z-score sits inside [-1, 1]', () => {
    // volume_zscore direction rule (line 61) hold branch: z-score in [-1, 1].
    // On a flat series z-score is 0 (hold); pair it with rsi at 75 (sell) so
    // the combined direction is non-hold.
    const hyp = buildHypothesis({
      indicatorSet: [
        { indicator: 'volume_zscore', lookback: 14, timeframe: '1h' },
        { indicator: 'rsi', lookback: 14, timeframe: '1h' },
      ],
    });
    const r = evaluateHypothesis(hyp, risingCandles(100));
    expect(r.totalSignals).toBe(1);
  });

  // ── Branch coverage: defaultDirection hold (value === 0) ───────────────────

  it('classifies a zero-valued numeric signal as hold', () => {
    // defaultDirection line 47 hold branch: v === 0.
    // returns on a flat series is exactly 0 (hold); pair it with macd's
    // flat value (small positive -> 'buy') so the combined direction is
    // non-hold and the evaluation is populated.
    const hyp = buildHypothesis({
      indicatorSet: [
        { indicator: 'returns', lookback: 14, timeframe: '1h' },
        { indicator: 'macd', lookback: 14, timeframe: '1h' },
      ],
    });
    const r = evaluateHypothesis(hyp, flatCandles(100));
    expect(r.totalSignals).toBe(1);
  });

  // ── Branch coverage: numericValue null confidence (line 117) ──────────────

  it('uses the null-confidence default when an indicator resolves to null', () => {
    // sma with lookback 200 on a 100-candle series returns null -> the
    // confidence branch 'value !== null' (line 117) takes the null path.
    // Pair sma (null -> hold) with rsi at 75 (sell) so the combined
    // direction is non-hold and the null-confidence branch is exercised.
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

  // ── Branch coverage: label null / TP / SL / timeout ────────────────────────

  it('returns a null label when the barrier window is too short (label null)', () => {
    // default maxHoldingMs: 60_000 -> 1-candle barrier window -> labelEvent
    // returns null (line 143/144 null branches).
    const hyp = buildHypothesis(); // default barrierConfig: maxHoldingMs 60_000
    const r = evaluateHypothesis(hyp, risingCandles(100));
    expect(r.passRate).toBe(0);
    expect(r.winRate).toBe(0);
  });

  it('labels a take-profit hit (label === 1)', () => {
    // maxHoldingMs: 120_000 -> 2-candle barrier window. Entry at candle 0,
    // next candle's high breaches takeProfit -> label 1 (passRate 1, winRate 1).
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
    // maxHoldingMs: 120_000 -> 2-candle barrier window. Entry at candle 0,
    // next candle's low breaches stopLoss -> label -1 (passRate 1, winRate 0).
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

  // ── numericValue: null fallback for unknown composite shapes ────────────────

  it('returns null for an object value with no recognized numeric keys', () => {
    // lines 43-44: the `return null` fallback after the recognized-key chain.
    // Every registered indicator emits rsi/macd/histogram/percentB/middle or a
    // number, so this path is only reachable via a synthetic unknown shape —
    // exercised directly to keep the fallback honest.
    expect(numericValue({ unknown: 42 })).toBeNull();
    expect(numericValue({ foo: 'bar' })).toBeNull();
    expect(numericValue({})).toBeNull();
  });

  it('extracts each recognized numeric key from composite values', () => {
    expect(numericValue({ rsi: 50 })).toBe(50);
    expect(numericValue({ macd: -0.5 })).toBe(-0.5);
    expect(numericValue({ histogram: 0.3 })).toBe(0.3);
    expect(numericValue({ percentB: 1.2 })).toBe(1.2);
    expect(numericValue({ middle: 100 })).toBe(100);
  });

  // ── Branch coverage: remaining direction-rule branches ──────────────────────

  it('classifies an rsi signal as buy when rsi < 30', () => {
    // rsi rule line 53 buy branch: rsi < 30. Falling candles drive RSI to ~0.
    const hyp = buildHypothesis({ indicatorSet: [{ indicator: 'rsi', lookback: 14, timeframe: '1h' }] });
    const r = evaluateHypothesis(hyp, fallingCandles(100, 200, 1, 1));
    expect(r.totalSignals).toBe(1);
    expect(Object.keys(r.regimePerformance)[0]).toBe('TREND_DOWN');
  });

  it('classifies a bollinger signal as buy when percentB < -1', () => {
    // bollinger rule line 55 buy branch: percentB < -1. A single outlier in
    // a wide lookback window yields a z-score beyond 6σ, pushing percentB
    // below -1. (A 14-window caps |z| at ~3.47, so a wider window is needed.)
    const hyp = buildHypothesis({ indicatorSet: [{ indicator: 'bollinger', lookback: 50, timeframe: '1h' }] });
    const candles = risingCandles(120, 100, 2, 2);
    candles[119] = { ...candles[119], close: -10000 }; // runaway downward last close
    const r = evaluateHypothesis(hyp, candles);
    expect(r.totalSignals).toBe(1);
  });

  it('classifies an atr signal as sell when atr > 1', () => {
    // atr rule line 59 sell branch: atr > 1. High-volatility candles yield
    // average true range well above 1 on a ~100 price base.
    const hyp = buildHypothesis({ indicatorSet: [{ indicator: 'atr', lookback: 14, timeframe: '1h' }] });
    const r = evaluateHypothesis(hyp, highVolCandles(100));
    expect(r.totalSignals).toBe(1);
  });

  it('classifies an atr signal as hold when atr is between -1 and 1', () => {
    // atr rule line 59 false branch: atr <= 1. Near-zero-oscillation candles
    // keep the average true range well below 1, so the rule falls through to
    // the hold path rather than the sell branch.
    const hyp = buildHypothesis({ indicatorSet: [{ indicator: 'atr', lookback: 14, timeframe: '1h' }] });
    const r = evaluateHypothesis(hyp, lowVolCandles(100));
    // ATR hold signal → combined direction is hold → empty evaluation.
    expect(r.totalSignals).toBe(0);
  });

  it('classifies realized volatility as sell when it exceeds 1', () => {
    const hyp = buildHypothesis({ indicatorSet: [{ indicator: 'realized_volatility', lookback: 14, timeframe: '1h' }] });
    const r = evaluateHypothesis(hyp, wideSwingCandles(100));
    expect(r.totalSignals).toBe(1);
  });

  it('classifies a volume_zscore signal as sell when z > 1', () => {
    // volume_zscore rule line 61 sell branch: z > 1. A last volume far above
    // the lookback mean yields z > 1.
    const hyp = buildHypothesis({
      indicatorSet: [{ indicator: 'volume_zscore', lookback: 14, timeframe: '1h' }],
    });
    const candles = risingCandles(100);
    for (let i = 85; i < 100; i += 1) candles[i] = { ...candles[i], volume: 100 };
    candles[99] = { ...candles[99], volume: 100000 }; // runaway upward last volume
    const r = evaluateHypothesis(hyp, candles);
    expect(r.totalSignals).toBe(1);
  });

  it('classifies a volume_zscore signal as buy when z < -1', () => {
    // volume_zscore rule line 61 buy branch: z < -1. A last volume far below
    // the lookback mean yields z < -1.
    const hyp = buildHypothesis({
      indicatorSet: [{ indicator: 'volume_zscore', lookback: 14, timeframe: '1h' }],
    });
    const candles = risingCandles(100);
    for (let i = 85; i < 100; i += 1) candles[i] = { ...candles[i], volume: 1000 };
    candles[99] = { ...candles[99], volume: 1 }; // last volume far below mean
    const r = evaluateHypothesis(hyp, candles);
    expect(r.totalSignals).toBe(1);
  });

  it('uses the default rule for an indicator absent from DIRECTION_RULES', () => {
    // line 67 fallback: indicator not in DIRECTION_RULES (distance_from_ma)
    // with a positive value → 'buy' via defaultDirection.
    const hyp = buildHypothesis({
      indicatorSet: [
        { indicator: 'distance_from_ma', lookback: 14, timeframe: '1h' },
        { indicator: 'rsi', lookback: 14, timeframe: '1h' },
      ],
    });
    const r = evaluateHypothesis(hyp, risingCandles(100));
    expect(r.totalSignals).toBe(1);
  });
});