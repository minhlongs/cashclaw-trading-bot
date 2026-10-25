import { describe, expect, it } from 'vitest';
import { computeGlostenHarrisDecomposition } from '../../src/tree/quantlib/microstructure/glosten-harris-spread-engine';
import type { GlostenHarrisTradeTick } from '../../src/tree/quantlib/microstructure/glosten-harris-spread-engine';

describe('Glosten-Harris (1988) Spread Decomposition Engine', () => {
  it('returns empty result when insufficient ticks are provided', () => {
    const empty = computeGlostenHarrisDecomposition([]);
    expect(empty.spread).toBe(0);
    expect(empty.orderProcessingShare).toBe(0);
    expect(empty.adverseSelectionShare).toBe(0);
  });

  it('correctly decomposes spread into order processing and adverse selection components', () => {
    // Generate synthetic tick series where dp = c * dq + z * q
    // With c = 0.05, z = 0.05 => spread = 0.20
    const directions: (1 | -1)[] = [1, -1, 1, 1, -1, 1, -1, -1, 1, -1, 1];
    let price = 100.0;
    const ticks: GlostenHarrisTradeTick[] = [{ price, tradeDirection: directions[0] }];

    for (let i = 1; i < directions.length; i++) {
      const q = directions[i];
      const dq = q - directions[i - 1];
      const dp = 0.05 * dq + 0.05 * q;
      price += dp;
      ticks.push({ price, tradeDirection: q });
    }

    const res = computeGlostenHarrisDecomposition(ticks);
    expect(res.spread).toBeGreaterThan(0);
    expect(res.orderProcessingCost).toBeCloseTo(0.05, 1);
    expect(res.adverseSelectionCost).toBeCloseTo(0.05, 1);
    expect(res.adverseSelectionShare).toBeGreaterThan(0);
    expect(res.adverseSelectionShare).toBeLessThanOrEqual(1);
    expect(res.orderProcessingShare + res.adverseSelectionShare).toBeCloseTo(1, 4);
    expect(res.rSquared).toBeGreaterThan(0.8);
  });
});
