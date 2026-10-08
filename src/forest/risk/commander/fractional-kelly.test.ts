import { describe, it, expect } from 'vitest';
import { computeFractionalKelly } from './fractional-kelly';

describe('Fractional Kelly Sizer', () => {
  it('computes positive half-kelly leverage for positive expectancy', () => {
    // 60% win rate, 1.5 win/loss ratio
    // Full Kelly: (1.5 * 0.6 - 0.4) / 1.5 = (0.9 - 0.4) / 1.5 = 0.5 / 1.5 = 0.333
    // Half Kelly: 0.1666
    const res = computeFractionalKelly(0.6, 1.5, 0.5);
    expect(res.fullKelly).toBeCloseTo(0.3333, 3);
    expect(res.halfKelly).toBeCloseTo(0.1666, 3);
    expect(res.recommendedLeverage).toBeCloseTo(0.1666, 3);
    expect(res.safeCapReached).toBe(false);
  });

  it('caps leverage at safe maximum boundary', () => {
    // Extremely high edge: 90% win rate, 5.0 ratio -> Full Kelly ~ 0.88
    const res = computeFractionalKelly(0.9, 5.0, 5.0, 2.0); // Artificial 5x multiplier capped at 2.0
    expect(res.safeCapReached).toBe(true);
    expect(res.recommendedLeverage).toBe(2.0);
  });

  it('returns zero leverage when edge is negative or non-viable', () => {
    const res = computeFractionalKelly(0.3, 1.0); // 30% win rate, 1.0 ratio -> negative expectancy
    expect(res.fullKelly).toBe(0);
    expect(res.recommendedLeverage).toBe(0);
  });
});
