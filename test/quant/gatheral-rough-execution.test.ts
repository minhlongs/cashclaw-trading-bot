import { describe, it, expect } from 'vitest';
import { computeGatheralRoughExecution } from '@/tree/quantlib/execution/gatheral-rough-execution-engine';

describe('Gatheral, Jaisson & Rosenbaum (2018) Rough Volatility Execution', () => {
  it('computes fractional memory impact and discrete liquidation trajectory', () => {
    const res = computeGatheralRoughExecution({
      initialShares: 10_000,
      initialPrice: 100,
      timeHorizon: 1.0,
      numSteps: 10,
      hurstParameter: 0.14,
      impactParam: 0.05,
    });

    expect(res.terminalShares).toBe(0);
    expect(res.trajectory.length).toBe(10);
    expect(res.totalExecutionCost).toBeGreaterThan(0);
    expect(res.averageExecutionPrice).toBeLessThan(100);
    expect(res.averageExecutionPrice).toBeGreaterThan(90);
    expect(res.terminalImpact).toBeGreaterThan(0);

    const firstStep = res.trajectory[0]!;
    const lastStep = res.trajectory[9]!;
    expect(firstStep.step).toBe(1);
    expect(lastStep.step).toBe(10);
    expect(lastStep.remainingShares).toBe(0);
  });

  it('handles zero initial shares safely', () => {
    const res = computeGatheralRoughExecution({
      initialShares: 0,
      initialPrice: 50,
      timeHorizon: 1.0,
      numSteps: 5,
    });

    expect(res.terminalShares).toBe(0);
    expect(res.totalExecutionCost).toBe(0);
    expect(res.averageExecutionPrice).toBe(50);
    expect(res.terminalImpact).toBe(0);
  });
});
