// Alpha Attribution Engine — math kernel tests

import { describe, it, expect } from 'vitest';
import { pearson } from './math';

describe('pearson', () => {
  it('returns 0 for constant arrays (zero variance)', () => {
    expect(pearson([5, 5, 5, 5], [1, 2, 3, 4])).toBe(0);
    expect(pearson([1, 2, 3, 4], [7, 7, 7, 7])).toBe(0);
    expect(pearson([3, 3], [3, 3])).toBe(0);
  });

  it('returns 1 for perfect positive correlation', () => {
    const x = [1, 2, 3, 4, 5];
    const y = [2, 4, 6, 8, 10];
    const r = pearson(x, y);
    expect(r).toBeGreaterThan(0.999);
    expect(r).toBeLessThanOrEqual(1);
  });

  it('returns -1 for perfect negative correlation', () => {
    const x = [1, 2, 3, 4, 5];
    const y = [10, 8, 6, 4, 2];
    const r = pearson(x, y);
    expect(r).toBeLessThan(-0.999);
    expect(r).toBeGreaterThanOrEqual(-1);
  });

  it('returns 0 for arrays shorter than 2 elements', () => {
    expect(pearson([], [])).toBe(0);
    expect(pearson([1], [1])).toBe(0);
  });
});
