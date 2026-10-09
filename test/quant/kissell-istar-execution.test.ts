import { describe, it, expect } from 'vitest';
import { computeKissellIStarExecution } from '@/tree/quantlib/execution/kissell-istar-engine';

describe('Kissell & Malamut (2006) I-Star Execution Model', () => {
  it('computes realistic non-linear market impact, trajectory and implementation shortfall', () => {
    const res = computeKissellIStarExecution({
      initialShares: 10_000,
      initialPrice: 50.0,
      timeHorizon: 1.0,
      numSteps: 4,
      dailyVolume: 1_000_000,
      dailyVolatility: 0.02,
      impactFactor: 0.25,
      sizeExponent: 0.5,
      volatilityExponent: 1.0,
      stepImpactFactor: 0.35,
      rateExponent: 0.5,
    });

    expect(res.terminalShares).toBe(0);
    expect(res.trajectory.length).toBe(4);
    expect(res.theoreticalIStar).toBeGreaterThan(0);
    expect(res.totalExecutionCost).toBeGreaterThan(0);
    expect(res.averageExecutionPrice).toBeLessThan(50.0);
    expect(res.averageExecutionPrice).toBeGreaterThan(0);

    for (const step of res.trajectory) {
      expect(step.sharesSold).toBe(2500);
      expect(step.instantaneousImpact).toBeGreaterThan(0);
      expect(step.cumulativePermanentImpact).toBeGreaterThan(0);
      expect(step.executionPrice).toBeLessThan(50.0);
    }
  });

  it('handles zero or minimal volume edge cases gracefully', () => {
    const res = computeKissellIStarExecution({
      initialShares: 0,
      initialPrice: 100.0,
      timeHorizon: 0.5,
      numSteps: 2,
    });
    expect(res.terminalShares).toBe(0);
    expect(res.totalExecutionCost).toBe(0);
    expect(res.averageExecutionPrice).toBe(100.0);
  });
});
