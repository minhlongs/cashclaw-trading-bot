import { describe, it, expect } from 'vitest';
import { computeGatheralSchiedResilientExecution } from '@/tree/quantlib/execution/gatheral-schied-resilient-engine';

describe('GatheralSchied (2013) Resilient Power-Law Execution Engine', () => {
  it('computes resilient power-law execution trajectory correctly', () => {
    const res = computeGatheralSchiedResilientExecution({
      initialShares: 1000,
      initialPrice: 100,
      timeHorizon: 10,
      numSteps: 5,
      temporaryImpact: 0.01,
      decayRate: 0.1,
      decayExponent: 0.5,
      impactPower: 1,
    });

    expect(res.trajectory.length).toBe(5);
    expect(res.terminalShares).toBe(0);
    expect(res.totalExecutionCost).toBeGreaterThan(0);
    expect(res.averageExecutionPrice).toBeLessThan(100);
    expect(res.priceReversion).toBeDefined();
  });

  it('handles edge case of single step and zero inventory', () => {
    const zeroRes = computeGatheralSchiedResilientExecution({
      initialShares: 0,
      initialPrice: 50,
      timeHorizon: 1,
      numSteps: 1,
      temporaryImpact: 0.005,
      decayRate: 0.2,
      decayExponent: 1.0,
    });
    expect(zeroRes.trajectory.length).toBe(1);
    expect(zeroRes.totalExecutionCost).toBe(0);
    expect(zeroRes.averageExecutionPrice).toBe(50);
  });
});
