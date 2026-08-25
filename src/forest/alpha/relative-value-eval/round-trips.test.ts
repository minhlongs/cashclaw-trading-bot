import { describe, expect, it } from 'vitest';
import { extractRoundTrips } from './round-trips';
import { buildRelativeValueReport, FUNDING_NOTE } from './report';
import type { PairPeriodRecord } from '@/tree/alpha/relative-value';
import type {
  RelativeValueEvalConfig,
  RelativeValueReportOptions,
} from './types';
import { RegimeLabel } from '@/tree/regime/types';

// ── Fixtures ───────────────────────────────────────────────────────────────

let seq = 0;
function record(overrides: Partial<PairPeriodRecord> = {}): PairPeriodRecord {
  seq++;
  return {
    timestamp: 1_700_000_000_000 + seq * 60_000,
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

/** Entry long at t1 (+2%), hold (+1%), exit flat (0). Then flat gap. */
const TRADE_SERIES: PairPeriodRecord[] = [
  record({ position: 'flat' }),
  record({ position: 'long_spread', netReturn: 0.02, grossReturn: 0.021, costPct: 0.001 }),
  record({ position: 'long_spread', netReturn: 0.01, grossReturn: 0.0105, costPct: 0.0005 }),
  record({ position: 'flat' }), // closes the trade
  record({ position: 'flat' }),
];

function evalConfig(overrides: Partial<RelativeValueEvalConfig> = {}): RelativeValueEvalConfig {
  return {
    hedgeWindow: 30,
    zWindow: 5,
    minObs: 10,
    entryZ: 2,
    exitZ: 0.5,
    maxHalfLife: 50,
    minCorrelation: 0,
    validationWindow: 30,
    revalidateEvery: 10,
    stressMode: 'conservative',
    minObservations: 4,
    experimentId: 'exp-1',
    timeframe: '1h',
    periodsPerYear: 8760,
    ...overrides,
  };
}

// ── extractRoundTrips ──────────────────────────────────────────────────────

describe('extractRoundTrips', () => {
  it('groups contiguous non-flat runs into trades with compounded returns', () => {
    const { roundTrips, openTradeCount } = extractRoundTrips(TRADE_SERIES);
    expect(openTradeCount).toBe(0);
    expect(roundTrips).toHaveLength(1);
    const trip = roundTrips[0]!;
    expect(trip.direction).toBe('long_spread');
    expect(trip.entryTimestamp).toBe(TRADE_SERIES[1]!.timestamp);
    expect(trip.exitTimestamp).toBe(TRADE_SERIES[2]!.timestamp);
    expect(trip.holdingPeriods).toBe(2);
    // Compounded: (1.02)(1.01) − 1
    expect(trip.netReturn).toBeCloseTo(0.02 + 0.01 + 0.0002, 12);
    expect(trip.costPct).toBeCloseTo(0.0015, 12);
  });

  it('separates two adjacent trades split by a single flat period', () => {
    const series = [
      record({ position: 'long_spread', netReturn: 0.01 }),
      record({ position: 'flat' }),
      record({ position: 'short_spread', netReturn: -0.02 }),
      record({ position: 'flat' }),
    ];
    const { roundTrips, openTradeCount } = extractRoundTrips(series);
    expect(openTradeCount).toBe(0);
    expect(roundTrips).toHaveLength(2);
    expect(roundTrips[0]!.direction).toBe('long_spread');
    expect(roundTrips[1]!.direction).toBe('short_spread');
    expect(roundTrips[1]!.netReturn).toBeCloseTo(-0.02, 12);
  });

  it('excludes a trade still open at series end and counts it as open', () => {
    const series = [
      record({ position: 'flat' }),
      record({ position: 'long_spread', netReturn: 0.03 }),
    ];
    const { roundTrips, openTradeCount } = extractRoundTrips(series);
    expect(roundTrips).toHaveLength(0);
    expect(openTradeCount).toBe(1);
  });

  it('handles empty and all-flat input deterministically', () => {
    expect(extractRoundTrips([])).toEqual({ roundTrips: [], openTradeCount: 0 });
    const allFlat = [record(), record()];
    expect(extractRoundTrips(allFlat)).toEqual({ roundTrips: [], openTradeCount: 0 });
  });

  it('is deterministic — repeated runs deep-equal', () => {
    const r1 = extractRoundTrips(TRADE_SERIES);
    const r2 = extractRoundTrips(TRADE_SERIES);
    expect(r2).toEqual(r1);
  });
});

// ── extended report ────────────────────────────────────────────────────────

describe('buildRelativeValueReport extensions', () => {
  it('computes expectancy/PF/winRate over completed trades only', () => {
    // Two completed trades: +2%, −1% → expectancy 0.005, PF 2, winRate 0.5.
    const sim = {
      periods: [
        record({ position: 'long_spread' as const, netReturn: 0.02, grossReturn: 0.02, costPct: 0 }),
        record({ position: 'flat' as const }),
        record({ position: 'short_spread' as const, netReturn: -0.01, grossReturn: -0.01, costPct: 0 }),
        record({ position: 'flat' as const }),
      ],
      equityCurve: [1, 1.02, 1.02, 1.0098],
      totalTurnover: 0,
      totalCosts: 0,
      tradeCount: 4,
      warnings: [],
      validationTrail: [],
    };
    const report = buildRelativeValueReport(sim, evalConfig());
    expect(report.roundTripMetrics.completedTrades).toBe(2);
    expect(report.roundTripMetrics.expectancyPerTrade).toBeCloseTo(0.005, 12);
    expect(report.roundTripMetrics.profitFactor).toBeCloseTo(2, 9);
    expect(report.roundTripMetrics.winRate).toBeCloseTo(0.5, 12);
  });

  it('zero-trade sims get zeroed metrics without NaN or Infinity', () => {
    const emptySim = {
      periods: [],
      equityCurve: [1],
      totalTurnover: 0,
      totalCosts: 0,
      tradeCount: 0,
      warnings: [],
      validationTrail: [],
    };
    const report = buildRelativeValueReport(emptySim, evalConfig());
    expect(report.roundTripMetrics).toEqual({
      expectancyPerTrade: 0, profitFactor: 0, winRate: 0, completedTrades: 0,
    });
  });

  it('funding is explicit N/A — fundingPct 0 with the exact note', () => {
    const sim = {
      periods: [], equityCurve: [1], totalTurnover: 0, totalCosts: 0,
      tradeCount: 0, warnings: [], validationTrail: [],
    };
    const report = buildRelativeValueReport(sim, evalConfig());
    expect(report.fundingPct).toBe(0);
    expect(report.fundingNote).toBe(FUNDING_NOTE);
    expect(FUNDING_NOTE).toBe('N/A — derivative endpoints 403; spot assumption');
  });

  it('pairStability map flows through options verbatim', () => {
    const sim = {
      periods: [], equityCurve: [1], totalTurnover: 0, totalCosts: 0,
      tradeCount: 0, warnings: [], validationTrail: [],
    };
    const stability = { 'AAA/BBB': 0.87, 'AAA/CCC': 0.42 };
    const report = buildRelativeValueReport(sim, evalConfig(), { pairStability: stability });
    expect(report.pairStability).toEqual(stability);
  });

  it('regimeBreakdown via injected labels — length mismatch throws fail-closed', () => {
    const sim = {
      periods: TRADE_SERIES.slice(0, 3),
      equityCurve: [1, 1.02, 1.0302],
      totalTurnover: 0, totalCosts: 0, tradeCount: 1, warnings: [], validationTrail: [],
    };
    const options: RelativeValueReportOptions = {
      regimeLabels: [RegimeLabel.RANGE, RegimeLabel.RANGE, RegimeLabel.HIGH_VOLATILITY],
    };
    const report = buildRelativeValueReport(sim, evalConfig(), options);
    expect(report.regimeBreakdown![RegimeLabel.RANGE]!.netReturn).not.toBe(0);
    expect(report.regimeBreakdown![RegimeLabel.UNKNOWN]).toEqual({
      netReturn: 0, annualizedSharpe: null, turnoverTotal: 0,
    });

    expect(() =>
      buildRelativeValueReport(
        sim,
        evalConfig(),
        { regimeLabels: [RegimeLabel.RANGE] },
      ),
    ).toThrow(/regimeLabels\.length/);
  });

  it('defaults preserve the base report — omitting options keeps prior fields identical', () => {
    const sim = {
      periods: TRADE_SERIES,
      equityCurve: [1, 1, 1.02, 1.0302, 1.0302, 1.0302],
      totalTurnover: 0.5, totalCosts: 0.001, tradeCount: 2, warnings: [], validationTrail: [],
    };
    const noOptions = buildRelativeValueReport(sim, evalConfig());
    const explicitEmpty = buildRelativeValueReport(sim, evalConfig(), {});
    // New additive fields exist on both; shared fields identical.
    expect(explicitEmpty).toEqual(noOptions);
    expect(noOptions.pairStability).toBeUndefined();
    expect(noOptions.regimeBreakdown).toBeUndefined();
    // Pre-existing fields unchanged in shape.
    expect(typeof noOptions.totalReturn).toBe('number');
    expect(noOptions.validationSummary.gateRunCount).toBe(0);
    expect(noOptions.periodCount).toBe(TRADE_SERIES.length);
  });
});
