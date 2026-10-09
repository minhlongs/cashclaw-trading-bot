import { describe, expect, it } from 'vitest';
import { computeGueantExecution } from '../../src/tree/quantlib/execution/gueant-engine';

describe('Guéant (2015) Closed-Form Optimal Execution Engine', () => {
  it('computes optimal liquidation trajectory under power-law impact', () => {
    const res = computeGueantExecution({
      totalShares: 10_000,
      timeHorizon: 1.0,
      numSteps: 10,
      impactParam: 0.001,
      powerLawExponent: 0.5,
      riskAversion: 0.0001,
    });

    expect(res.trajectory.length).toBe(10);
    expect(res.terminalShares).toBe(0);
    expect(res.trajectory[9]!.sharesRemaining).toBe(0);
    expect(res.expectedCost).toBeGreaterThan(0);
    expect(res.benchmarkTwapCost).toBeGreaterThan(0);
    expect(res.costSavings).toBeGreaterThanOrEqual(0);
  });

  it('handles edge case of zero shares', () => {
    const res = computeGueantExecution({
      totalShares: 0,
      timeHorizon: 1.0,
      numSteps: 5,
      impactParam: 0.001,
      powerLawExponent: 0.5,
      riskAversion: 0.0001,
    });

    expect(res.terminalShares).toBe(0);
    expect(res.expectedCost).toBe(0);
    expect(res.benchmarkTwapCost).toBe(0);
    expect(res.costSavings).toBe(0);
  });

  it('reflects higher power-law exponent with altered impact costs', () => {
    const resLinear = computeGueantExecution({
      totalShares: 5_000,
      timeHorizon: 1.0,
      numSteps: 8,
      impactParam: 0.002,
      powerLawExponent: 1.0,
      riskAversion: 0.0005,
    });

    const resSublinear = computeGueantExecution({
      totalShares: 5_000,
      timeHorizon: 1.0,
      numSteps: 8,
      impactParam: 0.002,
      powerLawExponent: 0.5,
      riskAversion: 0.0005,
    });

    expect(resLinear.expectedCost).toBeGreaterThan(0);
    expect(resSublinear.expectedCost).toBeGreaterThan(0);
    expect(resLinear.trajectory[7]!.sharesRemaining).toBe(0);
    expect(resSublinear.trajectory[7]!.sharesRemaining).toBe(0);
  });

  it('applies terminal penalty when terminal shares remain or penalty is configured', () => {
    const res = computeGueantExecution({
      totalShares: 10_000,
      timeHorizon: 1.0,
      numSteps: 10,
      impactParam: 0.001,
      powerLawExponent: 0.5,
      riskAversion: 0.0001,
      terminalPenalty: 0.05,
    });

    expect(res.expectedCost).toBeGreaterThan(0);
  });
});
