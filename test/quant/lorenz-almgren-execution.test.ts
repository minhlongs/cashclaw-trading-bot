import { describe, it, expect } from 'vitest';
import { computeLorenzAlmgrenExecution } from '@/tree/quantlib/execution/lorenz-almgren-engine';
import type { LorenzAlmgrenParams } from '@/tree/quantlib/execution/lorenz-almgren-types';

describe('Lorenz-Almgren (2011) Adaptive Execution Engine', () => {
  it('computes execution trajectory with liquidation completing at horizon', () => {
    const params: LorenzAlmgrenParams = {
      initialShares: 1000,
      initialPrice: 100,
      numSteps: 10,
      timeHorizon: 1.0,
      volatility: 0.2,
      riskAversion: 1e-4,
      temporaryImpact: 0.05,
      priceDriftSensitivity: 0.5,
    };

    const res = computeLorenzAlmgrenExecution(params);
    expect(res.trajectory.length).toBe(10);
    expect(res.terminalShares).toBe(0);
    expect(res.vwapPrice).toBeLessThanOrEqual(100);
    expect(res.vwapPrice).toBeGreaterThan(0);
    expect(res.totalExecutionCost).toBeGreaterThan(0);
    expect(res.meanVarianceUtility).toBeLessThan(0);
  });

  it('adapts execution speed when price drift varies', () => {
    const neutral = computeLorenzAlmgrenExecution({
      initialShares: 500,
      initialPrice: 50,
      numSteps: 5,
      timeHorizon: 0.5,
      volatility: 0.3,
      riskAversion: 1e-3,
      temporaryImpact: 0.1,
      priceDriftSensitivity: 0.0,
    });

    const sensitive = computeLorenzAlmgrenExecution({
      initialShares: 500,
      initialPrice: 50,
      numSteps: 5,
      timeHorizon: 0.5,
      volatility: 0.3,
      riskAversion: 1e-3,
      temporaryImpact: 0.1,
      priceDriftSensitivity: 1.0,
    });

    expect(neutral.trajectory.length).toBe(5);
    expect(sensitive.trajectory.length).toBe(5);
    expect(sensitive.terminalShares).toBe(0);
  });

  it('handles boundary conditions: 1 step, zero shares, high volatility', () => {
    const zeroRes = computeLorenzAlmgrenExecution({
      initialShares: 0,
      initialPrice: 100,
      numSteps: 1,
      timeHorizon: 0.1,
      volatility: 0.5,
      riskAversion: 0.01,
      temporaryImpact: 0.01,
    });
    expect(zeroRes.totalExecutionCost).toBe(0);
    expect(zeroRes.vwapPrice).toBe(100);
    expect(zeroRes.terminalShares).toBe(0);

    const singleStep = computeLorenzAlmgrenExecution({
      initialShares: 100,
      initialPrice: 200,
      numSteps: 1,
      timeHorizon: 0.1,
      volatility: 0.1,
      riskAversion: 1e-4,
      temporaryImpact: 0.02,
    });
    expect(singleStep.trajectory[0]?.sharesExecuted).toBe(100);
    expect(singleStep.terminalShares).toBe(0);
  });
});
