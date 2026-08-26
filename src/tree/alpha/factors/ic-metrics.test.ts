import { describe, expect, it } from 'vitest';
import {
  averageTieRanks,
  icInformationRatio,
  meanStd,
  pearson,
  regimeIcBreakdown,
  signConsistencyStability,
  spearman,
} from './ic-metrics';

describe('pearson', () => {
  it('returns 1 for a perfect positive linear relation', () => {
    expect(pearson([1, 2, 3, 4], [2, 4, 6, 8])).toBeCloseTo(1, 12);
  });

  it('returns -1 for a perfect negative linear relation', () => {
    expect(pearson([1, 2, 3, 4], [8, 6, 4, 2])).toBeCloseTo(-1, 12);
  });

  it('returns null for fewer than 2 points', () => {
    expect(pearson([1], [2])).toBeNull();
    expect(pearson([], [])).toBeNull();
  });

  it('returns null on zero variance in either series', () => {
    expect(pearson([1, 1, 1], [1, 2, 3])).toBeNull();
    expect(pearson([1, 2, 3], [2, 2, 2])).toBeNull();
  });

  it('returns null on length mismatch', () => {
    expect(pearson([1, 2, 3], [1, 2])).toBeNull();
  });
});

describe('averageTieRanks', () => {
  it('assigns plain 1-based ranks to distinct values', () => {
    expect(averageTieRanks([30, 10, 20])).toEqual([3, 1, 2]);
  });

  it('averages ranks across ties', () => {
    // Sorted: 1, 2, 2, 4 → the two 2s share ranks 2 and 3 → 2.5 each.
    expect(averageTieRanks([4, 2, 1, 2])).toEqual([4, 2.5, 1, 2.5]);
  });

  it('gives every element the mean rank when all values tie', () => {
    expect(averageTieRanks([7, 7, 7])).toEqual([2, 2, 2]);
  });
});

describe('spearman', () => {
  it('equals 1 for any strictly monotone transform (rank-invariance)', () => {
    expect(spearman([1, 2, 3, 4], [1, 8, 27, 64])).toBeCloseTo(1, 12);
  });

  it('diverges from pearson under an outlier', () => {
    const xs = [1, 2, 3, 4, 5];
    const ys = [1, 2, 3, 4, 100];
    const rho = spearman(xs, ys);
    const r = pearson(xs, ys);
    expect(rho).toBeCloseTo(1, 12); // ranks perfectly aligned
    expect(r).toBeLessThan(0.8); // outlier distorts the linear fit
    expect(r).not.toBeCloseTo(1, 2); // Pearson ≠ Spearman here
  });

  it('handles ties via average ranks', () => {
    // xs ranks [1, 2.5, 2.5, 4]; ys ranks [1, 2.5, 2.5, 4] → rho = 1.
    expect(spearman([1, 2, 2, 4], [10, 20, 20, 40])).toBeCloseTo(1, 12);
  });

  it('returns null below 2 points', () => {
    expect(spearman([1], [1])).toBeNull();
  });
});

describe('meanStd', () => {
  it('computes mean and ddof=1 std', () => {
    const stats = meanStd([1, 2, 3]);
    expect(stats?.mean).toBeCloseTo(2, 12);
    expect(stats?.std).toBeCloseTo(1, 12);
  });

  it('returns null std for a single point and null for empty', () => {
    expect(meanStd([5])).toEqual({ mean: 5, std: null });
    expect(meanStd([])).toBeNull();
  });
});

describe('icInformationRatio', () => {
  it('equals mean/std for a known series', () => {
    expect(icInformationRatio([1, 2, 3])).toBeCloseTo(2, 12);
  });

  it('returns null for zero-variance IC series', () => {
    expect(icInformationRatio([0.5, 0.5, 0.5])).toBeNull();
  });

  it('returns null below 2 points', () => {
    expect(icInformationRatio([0.3])).toBeNull();
    expect(icInformationRatio([])).toBeNull();
  });
});

describe('signConsistencyStability', () => {
  it('returns 1 when every window mean shares the full-sample sign', () => {
    expect(signConsistencyStability([1, 2, 1, 2, 1, 2], 3)).toBe(1);
  });

  it('computes the exact match fraction on a sign-flip series', () => {
    // W=2 → 5 windows: [1,1]=+, [1,-1]=0 (no sign), [-1,-1]=−, [-1,1]=0, [1,1]=+.
    // Full-sample mean = 0.2 > 0 → matches = 2 of 5.
    expect(signConsistencyStability([1, 1, -1, -1, 1, 1], 2)).toBeCloseTo(0.4, 12);
  });

  it('returns null when fewer than 2 windows fit', () => {
    expect(signConsistencyStability([1, 1, 1], 3)).toBeNull(); // exactly 1 window
    expect(signConsistencyStability([1, 1], 3)).toBeNull();
  });

  it('returns null when the full-sample mean is zero', () => {
    expect(signConsistencyStability([1, -1, 1, -1], 2)).toBeNull();
  });

  it('rejects invalid windows', () => {
    expect(() => signConsistencyStability([1, 1], 0)).toThrow(/positive integer/);
    expect(() => signConsistencyStability([1, 1], 1.5)).toThrow(/positive integer/);
  });
});

describe('regimeIcBreakdown', () => {
  it('groups valid ICs by injected label and sorts labels', () => {
    const summaries = regimeIcBreakdown(
      [100, 200, 300, 400],
      [0.1, null, 0.3, -0.2],
      { 100: 'TREND_UP', 200: 'TREND_UP', 300: 'TREND_UP', 400: 'RANGE' },
    );
    expect(summaries).toEqual([
      { label: 'RANGE', icMean: -0.2, count: 1 },
      { label: 'TREND_UP', icMean: 0.2, count: 2 },
    ]);
  });

  it('skips unlabeled timestamps and null ICs', () => {
    const summaries = regimeIcBreakdown([100, 200], [0.5, 0.7], { 100: 'RANGE' });
    expect(summaries).toEqual([{ label: 'RANGE', icMean: 0.5, count: 1 }]);
  });

  it('throws on length mismatch (fail-closed)', () => {
    expect(() => regimeIcBreakdown([100], [0.1, 0.2], {})).toThrow(/!== icValues.length/);
  });
});
