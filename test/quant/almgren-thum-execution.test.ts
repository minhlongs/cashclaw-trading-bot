import { describe, it, expect } from 'vitest';
import { computeAlmgrenThumExecution } from '@/tree/quantlib/execution/almgren-thum-engine';

describe('Almgren-Thum (2005) Non-Linear Market Impact Execution Engine', () => {
  it('computes execution trajectory with sublinear temporary and linear permanent impact', () => {
    const res = computeAlmgrenThumExecution({
      initialShares: 10_000,
      initialPrice: 100,
      timeHorizon: 1.0,
      numSteps: 5,
      dailyVolume: 500_000,
      temporaryImpactFactor: 0.05,
      permanentImpactFactor: 0.02,
      powerExponent: 0.6,
    });

    expect(res.trajectory.length).toBe(5);
    expect(res.terminalShares).toBe(0);
    expect(res.totalExecutionCost).toBeGreaterThan(0);
    expect(res.averageExecutionPrice).toBeLessThan(100);
    expect(res.permanentPriceImpact).toBeGreaterThan(0);

    const firstStep = res.trajectory[0]!;
    expect(firstStep.temporaryImpact).toBeGreaterThan(0);
    expect(firstStep.permanentImpact).toBeGreaterThan(0);
    expect(firstStep.sharesSold).toBe(2000);
  });

  it('handles zero inventory and single step edge cases', () => {
    const zeroRes = computeAlmgrenThumExecution({
      initialShares: 0,
      initialPrice: 50,
      timeHorizon: 1,
      numSteps: 2,
      temporaryImpactFactor: 0.01,
    });
    expect(zeroRes.terminalShares).toBe(0);
    expect(zeroRes.totalExecutionCost).toBe(0);
    expect(zeroRes.averageExecutionPrice).toBe(50);
    expect(zeroRes.permanentPriceImpact).toBe(0);

    const singleStepRes = computeAlmgrenThumExecution({
      initialShares: 500,
      initialPrice: 20,
      timeHorizon: 0.5,
      numSteps: 1,
      temporaryImpactFactor: 0.02,
    });
    expect(singleStepRes.terminalShares).toBe(0);
    expect(singleStepRes.trajectory.length).toBe(1);
    expect(singleStepRes.trajectory[0]?.sharesSold).toBe(500);
  });
});
