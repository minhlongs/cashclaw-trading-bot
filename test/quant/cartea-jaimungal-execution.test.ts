import { describe, it, expect } from 'vitest';
import { computeCarteaJaimungalExecution } from '@/tree/quantlib/execution/cartea-jaimungal-engine';

describe('Cartea-Jaimungal (2014) Optimal High-Frequency Execution Engine', () => {
  it('computes execution trajectory with positive inventory liquidation', () => {
    const res = computeCarteaJaimungalExecution({
      initialShares: 1000,
      initialPrice: 100,
      numSteps: 10,
      timeHorizon: 1.0,
      inventoryPenalty: 1e-4,
      temporaryImpact: 1e-3,
      alphaDrift: 0,
    });

    expect(res.trajectory.length).toBe(10);
    expect(res.terminalShares).toBe(0);
    expect(res.vwapPrice).toBeLessThanOrEqual(100);
    expect(res.totalExecutionCost).toBeGreaterThan(0);
  });

  it('adjusts execution speed in response to predictive alpha drift', () => {
    const neutral = computeCarteaJaimungalExecution({
      initialShares: 1000,
      initialPrice: 100,
      numSteps: 10,
      timeHorizon: 1.0,
      inventoryPenalty: 1e-4,
      temporaryImpact: 1e-3,
      alphaDrift: 0,
    });

    const positiveAlpha = computeCarteaJaimungalExecution({
      initialShares: 1000,
      initialPrice: 100,
      numSteps: 10,
      timeHorizon: 1.0,
      inventoryPenalty: 1e-4,
      temporaryImpact: 1e-3,
      alphaDrift: 0.05, // expect price rise -> slower initial liquidation
    });

    expect(positiveAlpha.effectiveAlphaTilt).toBeGreaterThan(0);
    // In early step, positive alpha slows liquidation
    expect(positiveAlpha.trajectory[0].sharesExecuted).toBeLessThanOrEqual(neutral.trajectory[0].sharesExecuted);
  });

  it('handles edge cases gracefully with single step and zero shares', () => {
    const zeroRes = computeCarteaJaimungalExecution({
      initialShares: 0,
      initialPrice: 50,
      numSteps: 5,
      timeHorizon: 1.0,
      inventoryPenalty: 1e-4,
      temporaryImpact: 1e-3,
    });
    expect(zeroRes.terminalShares).toBe(0);
    expect(zeroRes.totalExecutionCost).toBe(0);
    expect(zeroRes.vwapPrice).toBe(50);
  });
});
