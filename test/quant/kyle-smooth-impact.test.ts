import { describe, it, expect } from 'vitest';
import { computeKyleSmoothImpactExecution } from '@/tree/quantlib/execution/kyle-smooth-impact-engine';

describe('Kyle, Obizhaeva & Wang (2020) Smooth Market Impact', () => {
  it('computes smooth continuous impact and completes orderly liquidation', () => {
    const res = computeKyleSmoothImpactExecution({
      initialShares: 10_000,
      initialPrice: 100,
      timeHorizon: 1.0,
      numSteps: 5,
      dissipationRate: 2.0,
      impactParam: 0.05,
    });

    expect(res.terminalShares).toBe(0);
    expect(res.trajectory.length).toBe(5);
    expect(res.totalExecutionCost).toBeGreaterThan(0);
    expect(res.averageExecutionPrice).toBeLessThan(100);
    expect(res.terminalImpact).toBeGreaterThan(0);

    for (const step of res.trajectory) {
      expect(step.executionPrice).toBeLessThanOrEqual(100);
      expect(step.smoothImpact).toBeGreaterThan(0);
    }
  });

  it('handles zero initial shares safely without division errors', () => {
    const res = computeKyleSmoothImpactExecution({
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
