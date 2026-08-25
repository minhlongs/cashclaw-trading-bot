import { describe, it, expect } from 'vitest';
import { computeTurnover, sumTurnover } from './turnover';

describe('computeTurnover', () => {
  it('full rotation equals 1.0 (one-sided convention)', () => {
    // 100% asset A replaced by 100% asset B.
    const prev = { A: 1 };
    const next = { B: 1 };
    expect(computeTurnover(prev, next)).toBeCloseTo(1.0, 12);
  });

  it('entering a gross-1 book from cash equals 0.5', () => {
    expect(computeTurnover({}, { A: 1 })).toBeCloseTo(0.5, 12);
  });

  it('identical weights produce zero turnover', () => {
    const w = { A: 0.5, B: -0.5 };
    expect(computeTurnover(w, w)).toBe(0);
  });

  it('treats symbols missing from one side as weight 0', () => {
    const prev = { A: 0.5 };
    const next = { A: 0.5, B: 0.25 };
    expect(computeTurnover(prev, next)).toBeCloseTo(0.125, 12);
  });

  it('handles long/short sign flips', () => {
    const prev = { A: 1 };
    const next = { A: -1 };
    expect(computeTurnover(prev, next)).toBeCloseTo(1.0, 12);
  });
});

describe('sumTurnover', () => {
  it('sums turnover across records', () => {
    const records = [
      { turnover: 0.5 },
      { turnover: 1.0 },
      { turnover: 0.25 },
    ];
    expect(sumTurnover(records)).toBeCloseTo(1.75, 12);
  });

  it('returns 0 for empty input', () => {
    expect(sumTurnover([])).toBe(0);
  });
});
