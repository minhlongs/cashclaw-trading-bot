import { describe, it, expect } from 'vitest';
import { computeCarteaJaimungalOfiExecution } from '@/tree/quantlib/execution/cartea-jaimungal-ofi-engine';
import type { CarteaJaimungalOfiParams } from '@/tree/quantlib/execution/cartea-jaimungal-ofi-types';

describe('Cartea-Jaimungal (2016) OFI Execution Engine', () => {
  const baseParams: CarteaJaimungalOfiParams = {
    totalShares: 10000,
    timeHorizon: 1.0,
    numSteps: 10,
    temporaryImpact: 0.001,
    permanentImpact: 0.0005,
    riskAversion: 0.01,
    ofiDrift: 0.0,
    volatility: 0.2,
  };

  it('fully liquidates target inventory across all steps', () => {
    const res = computeCarteaJaimungalOfiExecution(baseParams);
    expect(res.trajectory.length).toBe(10);
    const finalStep = res.trajectory[res.trajectory.length - 1];
    expect(finalStep.remainingShares).toBe(0);
    const totalTraded = res.trajectory.reduce((s, st) => s + st.tradeSize, 0);
    expect(totalTraded).toBeCloseTo(10000, 3);
  });

  it('accelerates trading when favorable OFI drift is present', () => {
    const neutralRes = computeCarteaJaimungalOfiExecution({ ...baseParams, ofiDrift: 0 });
    const favorableOfiRes = computeCarteaJaimungalOfiExecution({ ...baseParams, ofiDrift: 0.05 });

    // Favorable drift accelerates trading speed at subsequent steps and yields positive OFI adjustment
    expect(favorableOfiRes.trajectory[1].tradeSpeed).toBeGreaterThan(neutralRes.trajectory[1].tradeSpeed);
    expect(favorableOfiRes.ofiCostAdjustment).toBeGreaterThan(0);
  });

  it('handles zero inventory gracefully', () => {
    const res = computeCarteaJaimungalOfiExecution({ ...baseParams, totalShares: 0 });
    expect(res.trajectory.length).toBe(10);
    expect(res.expectedCost).toBe(0);
    expect(res.benchmarkTwapCost).toBe(0);
  });

  it('handles single step boundary liquidation', () => {
    const res = computeCarteaJaimungalOfiExecution({ ...baseParams, numSteps: 1 });
    expect(res.trajectory.length).toBe(1);
    expect(res.trajectory[0].remainingShares).toBe(0);
    expect(res.trajectory[0].tradeSize).toBe(10000);
  });

  it('demonstrates positive cost savings relative to TWAP when optimizing with risk aversion', () => {
    const res = computeCarteaJaimungalOfiExecution({
      ...baseParams,
      riskAversion: 0.05,
      temporaryImpact: 0.002,
      ofiDrift: 0.02,
    });
    expect(res.costSavings).toBeGreaterThanOrEqual(0);
  });
});
