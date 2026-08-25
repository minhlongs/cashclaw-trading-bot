import { describe, expect, it } from 'vitest';
import { toEvaluationReport } from './survival-adapter';
import { toWalkForwardShim } from './survival-shim';
import { assembleSurvivalInput } from './survival-input';
import { extractRoundTrips } from './round-trips';
import type { PairPeriodRecord } from '@/tree/alpha/relative-value';
import type { RVWalkForwardResult } from './walk-forward';
import type { Candle } from '@/forest/backtest/ohlcv';

// ── Fixtures ───────────────────────────────────────────────────────────────

const T0 = 1_700_000_000_000;
const HOUR = 3_600_000;

let seq = 0;
function record(overrides: Partial<PairPeriodRecord> = {}): PairPeriodRecord {
  seq++;
  return {
    timestamp: T0 + seq * HOUR,
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
    ...overrides,
  };
}

/** One winning round trip (+0.98% compounded) and one losing trip (−3%). */
const TRADE_SERIES: PairPeriodRecord[] = [
  record({ position: 'flat' }),
  record({
    position: 'long_spread', netReturn: 0.02, grossReturn: 0.02,
    costPct: 0.001, turnover: 0.4, grossExposure: 1, netExposure: 1,
  }),
  record({
    position: 'long_spread', netReturn: -0.01, grossReturn: -0.01,
    costPct: 0.001, turnover: 0.1, grossExposure: 1, netExposure: 1,
  }),
  record({ position: 'flat' }),
  record({
    position: 'short_spread', netReturn: -0.03, grossReturn: -0.03,
    costPct: 0.002, turnover: 0.5,
  }),
  record({ position: 'flat' }),
];

const OPTIONS = {
  experimentId: 'exp-rv-1',
  symbol: 'PAIRS/M4',
  timeframe: '1d',
  periodsPerYear: 365,
} as const;

/** RV walk-forward fixture: two windows with disjoint OOS spans. */
function rvResult(periods: PairPeriodRecord[]): RVWalkForwardResult {
  return {
    windows: [
      {
        bounds: {
          trainStart: 0, trainEnd: 10, validateStart: 10, validateEnd: 12,
          testStart: 12, testEnd: 22, trainEndTime: T0 + 9 * HOUR,
          testStartTime: T0 + 12 * HOUR,
        },
        selectedPairs: [],
      },
      {
        bounds: {
          trainStart: 5, trainEnd: 15, validateStart: 15, validateEnd: 17,
          testStart: 17, testEnd: 27, trainEndTime: T0 + 14 * HOUR,
          testStartTime: T0 + 17 * HOUR,
        },
        selectedPairs: [],
      },
    ],
    perPairWindows: [],
    stitched: {
      netReturns: periods.map((p) => p.netReturn),
      roundTripsSource: periods,
    },
  };
}

function candle(timestamp: number, close: number): Candle {
  return { timestamp, open: close, high: close, low: close, close, volume: 0 };
}

// ── toEvaluationReport ─────────────────────────────────────────────────────

describe('toEvaluationReport', () => {
  const report = toEvaluationReport(TRADE_SERIES, OPTIONS);
  const trips = extractRoundTrips(TRADE_SERIES).roundTrips;

  it('maps trade-level fields from completed round trips only', () => {
    // Trips: (1.02·0.99−1) ≈ +0.98% and −3%.
    expect(report.numTrades).toBe(trips.length);
    expect(report.numTrades).toBe(2);
    expect(report.expectancy).toBeCloseTo(
      trips.reduce((s, t) => s + t.netReturn, 0) / 2, 12,
    );
    expect(report.expectancy).toBeLessThan(0);
    expect(report.avgTrade).toBe(report.expectancy);
    expect(report.winRate).toBeCloseTo(0.5, 12);
    expect(report.lossRate).toBeCloseTo(0.5, 12);
    expect(report.profitFactor).toBeCloseTo(0.0098 / 0.03, 9);
  });

  it('maps portfolio-level fields with fraction-unit drawdown', () => {
    const totalReturn = TRADE_SERIES.reduce((eq, p) => eq * (1 + p.netReturn), 1) - 1;
    expect(report.totalReturn).toBeCloseTo(totalReturn, 12);
    expect(report.netPnl).toBeCloseTo(totalReturn, 12);
    // Equity: 1 → 1.02 → 1.0098 → peak 1.0098, trough 1.0098·? — verify vs helper.
    expect(report.maxDrawdown).toBeGreaterThan(0);
    expect(report.maxDrawdown).toBeLessThan(1); // fraction, not percent
    expect(report.turnover).toBeCloseTo(0.4 + 0.1 + 0.5, 12);
    expect(report.exposure).toBeCloseTo((0 + 1 + 1 + 0 + 0 + 0) / 6, 12);
    expect(report.sharpe).not.toBeNull();
    expect(report.cagr).toBe(0);
  });

  it('decomposes costs via the stress-mode attribution shares', () => {
    const totalCost = 0.001 + 0.001 + 0.002;
    // conservative shares: fee 10/27, slip 7/27, impact 10/27
    expect(report.fees).toBeCloseTo(totalCost * (10 / 27), 12);
    expect(report.slippage).toBeCloseTo(totalCost * (7 / 27), 12);
  });

  it('maps median trade and recovery factor honestly', () => {
    const tripNets = trips.map((t) => t.netReturn).sort((a, b) => a - b);
    expect(report.medianTrade).toBeCloseTo((tripNets[0]! + tripNets[1]!) / 2, 12);
    expect(report.recoveryFactor).toBeCloseTo(
      Math.abs(report.totalReturn / report.maxDrawdown), 9,
    );
  });

  it('exposes one UNKNOWN regime bucket carrying the trades', () => {
    const bucket = report.byRegime.UNKNOWN;
    expect(bucket.numTrades).toBe(2);
    expect(bucket.expectancy).toBe(report.expectancy);
  });

  it('fails closed on empty OOS input or invalid annualization', () => {
    expect(() => toEvaluationReport([], OPTIONS)).toThrow(/no OOS periods/);
    expect(() =>
      toEvaluationReport(TRADE_SERIES, { ...OPTIONS, periodsPerYear: 0 }),
    ).toThrow(/periodsPerYear/);
    expect(() =>
      toEvaluationReport(TRADE_SERIES, { ...OPTIONS, periodsPerYear: NaN }),
    ).toThrow(/periodsPerYear/);
  });

  it('all-flat series yields zeroed trade metrics without NaN', () => {
    const flat = [record(), record()];
    const r = toEvaluationReport(flat, OPTIONS);
    expect(r.numTrades).toBe(0);
    expect(r.expectancy).toBe(0);
    expect(r.profitFactor).toBe(0);
    expect(r.maxDrawdown).toBe(0);
    expect(Number.isFinite(r.totalReturn)).toBe(true);
  });
});

// ── toWalkForwardShim ──────────────────────────────────────────────────────

describe('toWalkForwardShim', () => {
  const wf = rvResult([
    record({ timestamp: T0 + 13 * HOUR, netReturn: 0.01 }),
    record({ timestamp: T0 + 15 * HOUR, netReturn: 0.02 }),
    record({ timestamp: T0 + 17 * HOUR, netReturn: -0.03 }), // boundary → window 2
  ]);
  const shim = toWalkForwardShim(wf);

  it('assigns each OOS period to the latest window whose testStart ≤ ts', () => {
    expect(shim.windows).toHaveLength(2);
    expect(shim.windows[0]!.testMetrics.total_pnl).toBeCloseTo(0.03, 12);
    expect(shim.windows[1]!.testMetrics.total_pnl).toBeCloseTo(-0.03, 12);
  });

  it('leaves sharpe null so the consistency check falls back to PnL', () => {
    for (const w of shim.windows) {
      expect(w.testMetrics.sharpe_ratio).toBeNull();
    }
    expect(shim.aggregated.summaryStats.degradationRatio).toBe(0);
    expect(shim.aggregated.summaryStats.totalWindows).toBe(2);
  });

  it('fails closed on empty windows or out-of-span periods', () => {
    expect(() => toWalkForwardShim(rvResult([]))).not.toThrow();
    const emptyWindows = rvResult([]);
    const noWindowResult: RVWalkForwardResult = { ...emptyWindows, windows: [] };
    expect(() => toWalkForwardShim(noWindowResult)).toThrow(/no windows/);

    const early = [
      record({ timestamp: T0 + 1 * HOUR, netReturn: 0.01 }),
    ];
    expect(() => toWalkForwardShim(rvResult(early))).toThrow(/precedes every window/);
  });
});

// ── assembleSurvivalInput ──────────────────────────────────────────────────

describe('assembleSurvivalInput', () => {
  const assembly = {
    adapterOptions: OPTIONS,
    bootstrap: { iterations: 100, confidence: 0.95, seed: 42 },
    permutation: { iterations: 100, seed: 43 },
    walkForwardOptions: { minPositiveFraction: 0.5, maxSignFlips: 2 },
    crossAssetOptions: { minPositiveFraction: 0.5, minAssets: 1 },
    maxPbo: 0.5,
  };

  it('wires every field of the SurvivalEvaluationInput contract', () => {
    const periods = [
      record({ position: 'flat' as const }),
      record({ position: 'long_spread' as const, netReturn: 0.02 }),
      record({ position: 'flat' as const }),
      record({ position: 'short_spread' as const, netReturn: 0.01 }),
      record({ position: 'flat' as const }),
    ];
    const input = assembleSurvivalInput(
      rvResult(periods),
      [candle(T0, 1), candle(T0 + HOUR, 1.01)],
      [[0.01, 0.02], [-0.01, 0.005]],
      [],
      assembly,
    );
    expect(input.tradeReturns).toHaveLength(2);
    expect(input.strategyReturns).toEqual([0, 0.02, 0, 0.01, 0]);
    expect(input.entrySignals).toEqual([0, 1, 0, 1, 0]);
    expect(input.walkForward.windows).toHaveLength(2);
    expect(input.configMatrix).toEqual([[0.01, 0.02], [-0.01, 0.005]]);
    expect(input.baselineReport.experimentId).toBe('baseline_random_entry');
    expect(input.report.numTrades).toBe(2);
    expect(input.bootstrap).toEqual(assembly.bootstrap);
    expect(input.permutation).toEqual(assembly.permutation);
    expect(input.walkForwardOptions).toEqual(assembly.walkForwardOptions);
    expect(input.crossAssetOptions).toEqual(assembly.crossAssetOptions);
    expect(input.maxPbo).toBe(0.5);
  });

  it('fails closed when OOS output is too thin for the checks', () => {
    expect(() =>
      assembleSurvivalInput(rvResult([]), [], [[]], [], assembly),
    ).toThrow(/at least 2 OOS periods/);
    const noTrades = [record(), record()];
    expect(() =>
      assembleSurvivalInput(rvResult(noTrades), [], [[]], [], assembly),
    ).toThrow(/at least 2 completed trades/);
  });
});
