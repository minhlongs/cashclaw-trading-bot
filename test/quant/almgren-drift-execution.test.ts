import { describe, it, expect } from 'vitest';
import { computeAlmgrenDriftExecution } from '@/tree/quantlib/execution/almgren-drift-engine';

describe('Almgren (2012) Optimal Execution with Mean-Reverting Drift Engine', () => {
  it('executes liquidation with negative drift accelerating selling urgency', () => {
    const res = computeAlmgrenDriftExecution({
      initialShares: 1000,
      initialPrice: 100,
      timeHorizon: 1.0,
      numSteps: 5,
      temporaryImpact: 0.001,
      initialDrift: -2.0,
      meanReversionSpeed: 1.5,
    });

    expect(res.trajectory.length).toBe(5);
    expect(res.terminalShares).toBe(0);
    expect(res.totalExecutionCost).toBeGreaterThan(0);
    expect(res.averageExecutionPrice).toBeLessThan(100);
    expect(res.trajectory[0]?.sharesSold).toBeGreaterThan(0);
  });

  it('handles zero inventory and positive drift gracefully', () => {
    const zeroRes = computeAlmgrenDriftExecution({
      initialShares: 0,
      initialPrice: 50,
      timeHorizon: 1,
      numSteps: 2,
      temporaryImpact: 0.001,
      initialDrift: 0,
      meanReversionSpeed: 0,
    });
    expect(zeroRes.terminalShares).toBe(0);
    expect(zeroRes.totalExecutionCost).toBe(0);
    expect(zeroRes.averageExecutionPrice).toBe(50);

    const posRes = computeAlmgrenDriftExecution({
      initialShares: 500,
      initialPrice: 100,
      timeHorizon: 2.0,
      numSteps: 4,
      temporaryImpact: 0.002,
      initialDrift: 1.5,
      meanReversionSpeed: 0.8,
    });
    expect(posRes.terminalShares).toBe(0);
    expect(posRes.trajectory.length).toBe(4);
  });
});
