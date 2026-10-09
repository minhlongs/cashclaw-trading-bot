import { describe, it, expect } from 'vitest';
import { computeAlfonsiFruthExecution } from '../../src/tree/quantlib/execution/alfonsi-fruth-engine';

describe('Alfonsi-Fruth Execution Engine', () => {
  it('liquidates full inventory across specified steps', () => {
    const res = computeAlfonsiFruthExecution({
      initialInventory: 1000,
      initialPrice: 100,
      timeHorizon: 10,
      numSteps: 5,
      resilienceSpeed: 0.5,
      impactFactor: 0.01,
      shapeExponent: 1.0,
    });

    expect(res.terminalInventory).toBe(0);
    expect(res.trajectory.length).toBe(5);
    expect(res.totalCost).toBeGreaterThan(0);
    expect(res.vwapPrice).toBeLessThan(100);
    expect(res.terminalPrice).toBeLessThan(100);
  });

  it('demonstrates resilience recovery as resilienceSpeed increases', () => {
    const slow = computeAlfonsiFruthExecution({
      initialInventory: 500,
      initialPrice: 50,
      timeHorizon: 5,
      numSteps: 5,
      resilienceSpeed: 0.01,
      impactFactor: 0.02,
    });

    const fast = computeAlfonsiFruthExecution({
      initialInventory: 500,
      initialPrice: 50,
      timeHorizon: 5,
      numSteps: 5,
      resilienceSpeed: 2.0,
      impactFactor: 0.02,
    });

    expect(fast.totalCost).toBeLessThan(slow.totalCost);
    expect(fast.resilienceRecoveryBps).toBeGreaterThan(slow.resilienceRecoveryBps);
  });

  it('supports non-linear book shape exponents', () => {
    const linear = computeAlfonsiFruthExecution({
      initialInventory: 100,
      initialPrice: 200,
      timeHorizon: 2,
      numSteps: 4,
      resilienceSpeed: 0.5,
      impactFactor: 0.05,
      shapeExponent: 1.0,
    });

    const sublinear = computeAlfonsiFruthExecution({
      initialInventory: 100,
      initialPrice: 200,
      timeHorizon: 2,
      numSteps: 4,
      resilienceSpeed: 0.5,
      impactFactor: 0.05,
      shapeExponent: 0.5,
    });

    expect(linear.trajectory.length).toBe(4);
    expect(sublinear.trajectory.length).toBe(4);
    expect(linear.totalCost).not.toBe(sublinear.totalCost);
  });

  it('handles zero inventory safely', () => {
    const res = computeAlfonsiFruthExecution({
      initialInventory: 0,
      initialPrice: 100,
      timeHorizon: 1,
      numSteps: 2,
      resilienceSpeed: 1.0,
      impactFactor: 0.01,
    });

    expect(res.terminalInventory).toBe(0);
    expect(res.totalCost).toBe(0);
    expect(res.vwapPrice).toBe(100);
  });
});
