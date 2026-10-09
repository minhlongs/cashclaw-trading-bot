import { describe, expect, it } from 'vitest';
import { computeBertsimasLoExecution } from '@/tree/quantlib/execution/bertsimas-lo-execution-engine';

describe('Bertsimas-Lo (1998) Dynamic Optimal Execution Engine', () => {
  it('conserves total liquidated shares across horizon', () => {
    const res = computeBertsimasLoExecution({
      totalShares: 10000,
      numSteps: 10,
      temporaryImpactEta: 0.001,
      permanentImpactGamma: 0.0005,
      volatility: 0.02,
      riskAversion: 0.001,
    });
    expect(res.trajectory).toHaveLength(10);
    const totalLiquidated = res.trajectory.reduce((acc, step) => acc + step.tradeSize, 0);
    expect(totalLiquidated).toBeCloseTo(10000, 6);
    expect(res.trajectory[9].remainingShares).toBe(0);
  });

  it('maintains expected cost benchmark savings relative to immediate block liquidation', () => {
    const res = computeBertsimasLoExecution({
      totalShares: 5000,
      numSteps: 5,
      temporaryImpactEta: 0.002,
      permanentImpactGamma: 0.001,
      volatility: 0.015,
      riskAversion: 0.0001,
    });
    expect(res.expectedCost).toBeLessThanOrEqual(res.immediateCost);
    expect(res.impactSavings).toBeGreaterThan(0);
    expect(res.impactSavings).toBeCloseTo(res.immediateCost - res.expectedCost, 4);
  });

  it('front-loads execution and reduces variance under high risk aversion', () => {
    const lowRisk = computeBertsimasLoExecution({
      totalShares: 8000,
      numSteps: 8,
      temporaryImpactEta: 0.001,
      volatility: 0.02,
      riskAversion: 1e-6,
    });
    const highRisk = computeBertsimasLoExecution({
      totalShares: 8000,
      numSteps: 8,
      temporaryImpactEta: 0.001,
      volatility: 0.02,
      riskAversion: 0.05,
    });
    expect(highRisk.trajectory[0].tradeSize).toBeGreaterThan(lowRisk.trajectory[0].tradeSize);
    expect(highRisk.variance).toBeLessThan(lowRisk.variance);
  });

  it('handles edge scenarios cleanly (single step, zero shares, zero permanent impact)', () => {
    const singleStep = computeBertsimasLoExecution({
      totalShares: 1000,
      numSteps: 1,
      temporaryImpactEta: 0.005,
    });
    expect(singleStep.trajectory).toHaveLength(1);
    expect(singleStep.trajectory[0].tradeSize).toBe(1000);
    expect(singleStep.expectedCost).toBeCloseTo(singleStep.immediateCost, 6);
    expect(singleStep.twapCost).toBeCloseTo(singleStep.expectedCost, 6);

    const zeroShares = computeBertsimasLoExecution({
      totalShares: 0,
      numSteps: 4,
      temporaryImpactEta: 0.005,
    });
    expect(zeroShares.expectedCost).toBe(0);
    expect(zeroShares.impactSavings).toBe(0);
  });
});
