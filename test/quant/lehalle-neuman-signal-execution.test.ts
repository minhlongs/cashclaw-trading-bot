import { describe, expect, it } from 'vitest';
import { computeLehalleNeumanExecution } from '../../src/tree/quantlib/execution/lehalle-neuman-engine';

describe('Lehalle-Neuman (2019) Signal-Aware Optimal Execution Engine', () => {
  const baseParams = {
    totalShares: 100_000,
    timeHorizon: 1.0,
    numSteps: 10,
    temporaryImpact: 0.001,
    permanentImpact: 0.0005,
    riskAversion: 0.002,
    signalAlpha: 0.05,
    signalDecay: 2.0,
  };

  it('liquidates 100% of inventory across the time horizon', () => {
    const res = computeLehalleNeumanExecution(baseParams);
    expect(res.trajectory.length).toBe(10);
    const finalStep = res.trajectory[res.trajectory.length - 1]!;
    expect(finalStep.remainingShares).toBe(0);
    const sumTraded = res.trajectory.reduce((s, step) => s + step.tradeSize, 0);
    expect(sumTraded).toBeCloseTo(100_000, 1);
  });

  it('accelerates trade speed when signal alpha is positive', () => {
    const neutralRes = computeLehalleNeumanExecution({ ...baseParams, signalAlpha: 0 });
    const bullishRes = computeLehalleNeumanExecution({ ...baseParams, signalAlpha: 0.1 });
    expect(bullishRes.trajectory[1]!.tradeSpeed).toBeGreaterThan(neutralRes.trajectory[1]!.tradeSpeed);
  });

  it('handles edge case of zero shares gracefully', () => {
    const res = computeLehalleNeumanExecution({ ...baseParams, totalShares: 0 });
    expect(res.expectedCost).toBe(0);
    expect(res.trajectory[0]!.tradeSize).toBe(0);
  });

  it('calculates higher TWAP benchmark cost under risk aversion', () => {
    const res = computeLehalleNeumanExecution(baseParams);
    expect(res.expectedCost).toBeDefined();
    expect(res.benchmarkTwapCost).toBeDefined();
    expect(res.costSavings).toBeGreaterThanOrEqual(0);
  });
});
