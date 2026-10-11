import { describe, it, expect } from 'vitest';
import { computeAmihudMendelsonSpread } from '@/tree/quantlib/microstructure/amihud-mendelson-engine';

describe('Amihud & Mendelson (1986) Clientele Spread & Liquidity Premium Engine', () => {
  it('computes equilibrium return and clientele sorting across holding horizons', () => {
    const res = computeAmihudMendelsonSpread({
      baseYield: 0.05,
      spreadPct: 0.02,
      investorHorizons: [0.1, 0.5, 1.0, 5.0],
      amortizationFactor: 1.0,
    });

    expect(res.clienteleReturns).toHaveLength(4);
    expect(res.equilibriumReturn).toBeGreaterThan(0.05);
    expect(res.liquidityPremiumBps).toBeGreaterThan(0);
    expect(res.optimalHoldingHorizon).toBe(5.0);
    expect(res.marginalSpreadElasticity).toBeGreaterThan(0);

    // Shorter horizons require higher gross returns due to high spread amortization
    expect(res.clienteleReturns[0]!.requiredReturn).toBeGreaterThan(
      res.clienteleReturns[3]!.requiredReturn,
    );
    expect(res.clienteleReturns[0]!.amortizedSpreadBps).toBeGreaterThan(
      res.clienteleReturns[3]!.amortizedSpreadBps,
    );
  });

  it('handles edge cases of single horizon and zero/small parameters', () => {
    const res = computeAmihudMendelsonSpread({
      baseYield: 0.04,
      spreadPct: 0.01,
      investorHorizons: [2.0],
    });

    expect(res.clienteleReturns).toHaveLength(1);
    expect(res.optimalHoldingHorizon).toBe(2.0);
    expect(res.clienteleReturns[0]!.requiredReturn).toBeCloseTo(0.04 + 0.01 / 2.0, 4);
  });
});
