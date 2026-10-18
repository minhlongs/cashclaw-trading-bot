import { describe, it, expect } from 'vitest';
import { computeHrpRecursiveBisection } from '../hrp-recursive-bisection';

describe('López de Prado (2016) Hierarchical Risk Parity (HRP) Recursive Bisection', () => {
  const SYMBOLS = ['BTC-PERP', 'ETH-PERP', 'SOL-PERP', 'PAXG-PERP'] as const;
  const VOLATILITIES = [0.48, 0.56, 0.78, 0.14] as const;
  const CORR_MATRIX = [
    [1.0, 0.86, 0.78, 0.12],
    [0.86, 1.0, 0.82, 0.10],
    [0.78, 0.82, 1.0, 0.08],
    [0.12, 0.10, 0.08, 1.0],
  ] as const;

  it('normalizes weights to sum to 1 with strictly positive weights and valid distance matrix', () => {
    const res = computeHrpRecursiveBisection({
      symbols: SYMBOLS,
      volatilities: VOLATILITIES,
      correlationMatrix: CORR_MATRIX,
    });

    const weightSum = res.allocations.reduce((acc, a) => acc + a.hrpWeight, 0);
    expect(weightSum).toBeCloseTo(1, 5);
    expect(res.seriatedSymbols).toHaveLength(4);
    expect(res.diversificationRatio).toBeGreaterThan(1.0);
    expect(res.portfolioVolatility).toBeGreaterThan(0);

    for (const alloc of res.allocations) {
      expect(alloc.hrpWeight).toBeGreaterThan(0);
      expect(alloc.hrpWeight).toBeLessThan(1);
    }
    expect(res.distanceMatrix[0]?.[0]).toBe(0);
    expect(res.distanceMatrix[0]?.[3]).toBeGreaterThan(res.distanceMatrix[0]?.[1] ?? 0);
  });

  it('allocates substantially higher HRP weight to low-volatility uncorrelated hedges than high-vol cluster assets', () => {
    const res = computeHrpRecursiveBisection({
      symbols: SYMBOLS,
      volatilities: VOLATILITIES,
      correlationMatrix: CORR_MATRIX,
    });

    const solAlloc = res.allocations.find((a) => a.symbol === 'SOL-PERP')!;
    const paxgAlloc = res.allocations.find((a) => a.symbol === 'PAXG-PERP')!;
    const btcAlloc = res.allocations.find((a) => a.symbol === 'BTC-PERP')!;

    expect(paxgAlloc.hrpWeight).toBeGreaterThan(btcAlloc.hrpWeight);
    expect(btcAlloc.hrpWeight).toBeGreaterThan(solAlloc.hrpWeight);
  });

  it('remains numerically stable under high collinearity (rho = 0.99)', () => {
    const res = computeHrpRecursiveBisection({
      symbols: ['ASSET_A', 'ASSET_B', 'ASSET_C'],
      volatilities: [0.35, 0.35, 0.35],
      correlationMatrix: [
        [1.0, 0.99, 0.99],
        [0.99, 1.0, 0.99],
        [0.99, 0.99, 1.0],
      ],
    });

    const sum = res.allocations.reduce((acc, a) => acc + a.hrpWeight, 0);
    expect(sum).toBeCloseTo(1, 5);
    for (const alloc of res.allocations) {
      expect(Number.isFinite(alloc.hrpWeight)).toBe(true);
      expect(alloc.hrpWeight).toBeGreaterThan(0.2);
    }
  });
});
