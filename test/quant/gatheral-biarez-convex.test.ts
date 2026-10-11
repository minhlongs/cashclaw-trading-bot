import { describe, it, expect } from 'vitest';
import { computeGatheralBiarezConvexExecution } from '../../src/tree/quantlib/execution/gatheral-biarez-convex-engine';

describe('Gatheral-Biarez (2011) Convex Execution Engine', () => {
  it('computes discrete liquidation trajectory under convex impact exponent', () => {
    const res = computeGatheralBiarezConvexExecution({
      initialShares: 1000,
      initialPrice: 100,
      timeHorizon: 1.0,
      numSteps: 5,
      convexExponent: 1.5,
      impactParam: 0.1,
      permImpactParam: 0.05,
    });

    expect(res.trajectory.length).toBe(5);
    expect(res.terminalShares).toBe(0);
    expect(res.totalExecutionCost).toBeGreaterThan(0);
    expect(res.averageExecutionPrice).toBeLessThan(100);
    expect(res.terminalImpact).toBeGreaterThan(0);
    for (const step of res.trajectory) {
      expect(step.sharesSold).toBe(200);
      expect(step.executionPrice).toBeGreaterThan(0);
      expect(step.convexImpact).toBeGreaterThan(0);
    }
  });

  it('handles zero initial shares gracefully', () => {
    const res = computeGatheralBiarezConvexExecution({
      initialShares: 0,
      initialPrice: 50,
      timeHorizon: 1.0,
      numSteps: 3,
    });
    expect(res.terminalShares).toBe(0);
    expect(res.totalExecutionCost).toBe(0);
    expect(res.averageExecutionPrice).toBe(50);
  });
});
