import { describe, it, expect } from 'vitest';
import { computeSchiedZhangExecution } from '@/tree/quantlib/execution/schied-zhang-engine';

describe('Schied-Zhang (2019) Optimal Execution with Rough Volatility', () => {
  it('computes execution trajectory with rough volatility adjustments', () => {
    const res = computeSchiedZhangExecution({
      initialShares: 1000,
      initialPrice: 100,
      numSteps: 10,
      timeHorizon: 1.0,
      hurstParameter: 0.1, // rough regime H = 0.1
      baseVolatility: 0.25,
      riskAversion: 1e-4,
      temporaryImpact: 2e-4,
    });

    expect(res.trajectory.length).toBe(10);
    expect(res.terminalShares).toBe(0);
    expect(res.vwapPrice).toBeLessThan(100);
    expect(res.roughnessMultiplier).toBeGreaterThan(1);
    expect(res.totalExecutionCost).toBeGreaterThan(0);
  });

  it('handles standard Brownian motion boundary H = 0.5', () => {
    const res = computeSchiedZhangExecution({
      initialShares: 500,
      initialPrice: 50,
      numSteps: 5,
      timeHorizon: 0.5,
      hurstParameter: 0.5, // standard diffusive
      baseVolatility: 0.2,
      riskAversion: 1e-4,
      temporaryImpact: 1e-4,
    });

    expect(res.roughnessMultiplier).toBeCloseTo(1.0, 5);
    expect(res.terminalShares).toBe(0);
    expect(res.trajectory[0].sharesExecuted).toBeGreaterThan(0);
  });

  it('liquidates fully on single-step horizon', () => {
    const res = computeSchiedZhangExecution({
      initialShares: 100,
      initialPrice: 20,
      numSteps: 1,
      timeHorizon: 0.1,
      hurstParameter: 0.2,
      baseVolatility: 0.3,
      riskAversion: 1e-3,
      temporaryImpact: 1e-3,
    });

    expect(res.trajectory.length).toBe(1);
    expect(res.trajectory[0].sharesExecuted).toBe(100);
    expect(res.terminalShares).toBe(0);
  });
});
