import { describe, expect, it } from 'vitest';
import { bucketWindowStats, oosExpectancy } from './oos-windows';
import type { RVWalkForwardResult } from './walk-forward';
import type { PairPeriodRecord } from '@/tree/alpha/relative-value';

const T0 = 1_700_000_000_000;
const HOUR = 3_600_000;

function record(timestamp: number, netReturn: number): PairPeriodRecord {
  return {
    timestamp,
    position: 'flat',
    hedgeRatio: null,
    zScore: null,
    weights: {},
    turnover: 0,
    costPct: 0,
    grossReturn: netReturn,
    netReturn,
    grossExposure: 0,
    netExposure: 0,
  };
}

function rv(periods: readonly PairPeriodRecord[], starts?: number[]): RVWalkForwardResult {
  const windowStarts = starts ?? [T0 + 12 * HOUR, T0 + 17 * HOUR];
  return {
    windows: windowStarts.map((testStartTime, i) => ({
      bounds: {
        trainStart: i * 10,
        trainEnd: i * 10 + 8,
        validateStart: i * 10 + 8,
        validateEnd: i * 10 + 9,
        testStart: i * 10 + 9,
        testEnd: i * 10 + 19,
        trainEndTime: testStartTime - 3 * HOUR,
        testStartTime,
      },
      selectedPairs: [],
    })),
    perPairWindows: [],
    stitched: {
      netReturns: periods.map((p) => p.netReturn),
      roundTripsSource: periods,
    },
  };
}

describe('bucketWindowStats', () => {
  it('assigns each period to the latest window whose testStart ≤ ts', () => {
    const stats = bucketWindowStats(
      rv([
        record(T0 + 13 * HOUR, 0.01),
        record(T0 + 15 * HOUR, 0.02),
        record(T0 + 17 * HOUR, -0.03), // boundary → window 2
        record(T0 + 20 * HOUR, 0.04),
      ]),
    );
    expect(stats.means[0]).toBeCloseTo(0.015, 12);
    expect(stats.means[1]).toBeCloseTo(0.005, 12);
    expect(stats.counts).toEqual([2, 2]);
  });

  it('empty windows carry mean 0 with count 0 (traded nothing)', () => {
    const stats = bucketWindowStats(rv([record(T0 + 20 * HOUR, 0.05)]));
    expect(stats.means).toEqual([0, 0.05]);
    expect(stats.counts).toEqual([0, 1]);
  });

  it('fails closed on empty windows or out-of-span periods', () => {
    const empty = rv([]);
    expect(() =>
      bucketWindowStats({ ...empty, windows: [] }),
    ).toThrow(/no windows/);
    const early = rv([record(T0 + 1 * HOUR, 0.01)]);
    expect(() => bucketWindowStats(early)).toThrow(/precedes every window/);

    // Non-monotonic window starts are rejected.
    const monotonic = rv([], [T0 + 17 * HOUR, T0 + 12 * HOUR]);
    expect(() => bucketWindowStats(monotonic)).toThrow(/strictly increase/);
  });
});

describe('oosExpectancy', () => {
  it('is the plain mean of all stitched net returns', () => {
    const value = oosExpectancy(
      rv([
        record(T0, 0.02),
        record(T0 + HOUR, -0.01),
        record(T0 + 2 * HOUR, 0.05),
      ]),
    );
    expect(value).toBeCloseTo(0.02, 12);
  });

  it('returns 0 for an empty stitched series without NaN', () => {
    expect(oosExpectancy(rv([]))).toBe(0);
  });
});
