import { describe, expect, it } from 'vitest';
import {
  BENCHMARK_STRATEGIES,
  oosSpan,
  runBenchmarks,
} from './benchmarks';
import { runBaseline } from '@/forest/alpha/baselines';
import type { Candle } from '@/forest/backtest/ohlcv';
import type { PairPeriodRecord } from '@/tree/alpha/relative-value';

const T0 = 1_700_000_000_000;
const DAY = 86_400_000;

function candle(i: number, close: number): Candle {
  return {
    timestamp: T0 + i * DAY,
    open: close,
    high: close,
    low: close,
    close,
    volume: 100,
  };
}

function period(timestamp: number): PairPeriodRecord {
  return {
    timestamp,
    position: 'flat',
    hedgeRatio: null,
    zScore: null,
    weights: {},
    turnover: 0,
    costPct: 0,
    grossReturn: 0,
    netReturn: 0,
    grossExposure: 0,
    netExposure: 0,
  };
}

/** 60 candles with a mild uptrend so momentum/MR can trade. */
function trendSeries(base: number): Candle[] {
  return Array.from({ length: 60 }, (_, i) =>
    candle(i, base * (1 + 0.004 * i + 0.01 * Math.sin(i / 3))),
  );
}

const OPTIONS = {
  timeframe: '1d',
  stressMode: 'conservative' as const,
  feePct: 0.0008,
  slipPct: 0.0003,
};

describe('oosSpan', () => {
  it('returns the inclusive min/max timestamp', () => {
    const span = oosSpan([period(T0 + 5 * DAY), period(T0), period(T0 + 9 * DAY)]);
    expect(span).toEqual({ start: T0, end: T0 + 9 * DAY });
  });

  it('fails closed on empty input', () => {
    expect(() => oosSpan([])).toThrow(/no stitched OOS periods/);
  });
});

describe('runBenchmarks', () => {
  const candlesA = trendSeries(100);
  const candlesB = trendSeries(50);
  const universe = { AAA: candlesA, BBB: candlesB };
  const span = oosSpan([period(T0), period(T0 + 59 * DAY)]);

  it('produces one averaged row per benchmark strategy', () => {
    const comparison = runBenchmarks(universe, span, OPTIONS);
    expect(comparison.rows.map((r) => r.strategy)).toEqual([
      ...BENCHMARK_STRATEGIES,
    ]);
    for (const row of comparison.rows) {
      expect(row.symbols).toBe(2);
      expect(Number.isFinite(row.expectancy)).toBe(true);
      expect(Number.isFinite(row.profitFactor)).toBe(true);
      expect(Number.isFinite(row.maxDrawdown)).toBe(true);
      expect(Number.isFinite(row.netPnl)).toBe(true);
    }
  });

  it('averages expectancy across symbols exactly', () => {
    const comparison = runBenchmarks(universe, span, OPTIONS);
    const bh = comparison.rows.find((r) => r.strategy === 'buy_hold')!;
    const expected =
      (comparison.perSymbol.buy_hold[0]!.expectancy +
        comparison.perSymbol.buy_hold[1]!.expectancy) /
      2;
    expect(bh.expectancy).toBeCloseTo(expected, 12);
  });

  it('runs each baseline over the identical span slice', () => {
    const comparison = runBenchmarks(universe, span, OPTIONS);
    const direct = runBaseline(candlesA, {
      strategy: 'buy_hold',
      symbol: 'AAA',
      ...OPTIONS,
    });
    expect(comparison.perSymbol.buy_hold[0]!.netPnl).toBeCloseTo(
      direct.netPnl,
      12,
    );
    expect(comparison.perSymbol.buy_hold[0]!.numTrades).toBe(direct.numTrades);
  });

  it('slices candles to the span before running baselines', () => {
    // Universe candles extend beyond the span; only in-span candles count.
    const extended = [...candlesA, candle(60, 999), candle(61, 999)];
    const narrowSpan = oosSpan([period(T0), period(T0 + 59 * DAY)]);
    const comparison = runBenchmarks({ AAA: extended }, narrowSpan, OPTIONS);
    const direct = runBaseline(candlesA, {
      strategy: 'buy_hold',
      symbol: 'AAA',
      ...OPTIONS,
    });
    expect(comparison.perSymbol.buy_hold[0]!.netPnl).toBeCloseTo(
      direct.netPnl,
      12,
    );
  });

  it('keeps per-symbol reports for every strategy', () => {
    const comparison = runBenchmarks(universe, span, OPTIONS);
    for (const strategy of BENCHMARK_STRATEGIES) {
      expect(comparison.perSymbol[strategy]).toHaveLength(2);
      for (const report of comparison.perSymbol[strategy]) {
        expect(report.experimentId).toBe(`baseline_${strategy}`);
      }
    }
  });

  it('fails closed on empty universe or thin in-span candles', () => {
    expect(() => runBenchmarks({}, span, OPTIONS)).toThrow(/empty universe/);
    const thin = { AAA: [candle(0, 100)] };
    expect(() => runBenchmarks(thin, span, OPTIONS)).toThrow(
      /has 1 candles inside the OOS span/,
    );
    const outside = { AAA: [candle(100, 1), candle(101, 2)] };
    expect(() => runBenchmarks(outside, span, OPTIONS)).toThrow(
      /has 0 candles inside the OOS span/,
    );
  });
});
