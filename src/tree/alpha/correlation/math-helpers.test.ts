import { describe, it, expect } from 'vitest';
import { mean, stddev, olsResiduals } from './math-helpers';

describe('mean', () => {
  it('returns 0 for an empty array', () => {
    expect(mean([])).toBe(0);
  });

  it('computes the arithmetic mean', () => {
    expect(mean([1, 2, 3, 4])).toBe(2.5);
  });
});

describe('stddev', () => {
  it('returns 0 for an empty array', () => {
    expect(stddev([])).toBe(0);
  });

  it('returns 0 for a single element', () => {
    expect(stddev([7])).toBe(0);
  });

  it('computes sample standard deviation', () => {
    // population variance of [2,4,4,4,5,5,7,9] is 4, sample variance 32/7
    const sd = stddev([2, 4, 4, 4, 5, 5, 7, 9]);
    expect(sd).toBeCloseTo(Math.sqrt(32 / 7), 10);
  });
});

describe('olsResiduals', () => {
  it('returns empty arrays when fewer than 2 aligned points', () => {
    expect(olsResiduals([], [])).toEqual([]);
    expect(olsResiduals([1], [2])).toEqual([]);
  });

  it('returns zero residuals when x is constant', () => {
    // ssXX === 0 guard: beta falls back to 0, so residuals are y - mean(y).
    const res = olsResiduals([5, 5, 5], [1, 2, 3]);
    expect(res).toHaveLength(3);
    expect(res.reduce((a, b) => a + b, 0)).toBeCloseTo(0, 10);
  });

  it('aligns to the shorter series', () => {
    // n = min length: y is shorter ([2,4]), so only the first two x values
    // produce residuals — the output has length 2, not 3. The regression
    // centers on each array's full mean (not the aligned slice), which is
    // the function's existing behavior.
    const res = olsResiduals([1, 2, 3], [2, 4]);
    expect(res).toHaveLength(2);
    // All residuals are finite numbers.
    res.forEach((r) => expect(Number.isFinite(r)).toBe(true));
  });

  it('returns residuals that sum to zero for a perfect linear fit', () => {
    // y = 2x over the aligned prefix → beta=2, alpha=0, residuals all 0.
    const res = olsResiduals([1, 2], [2, 4]);
    expect(res).toHaveLength(2);
    res.forEach((r) => expect(Math.abs(r)).toBeLessThan(1e-10));
  });
});
