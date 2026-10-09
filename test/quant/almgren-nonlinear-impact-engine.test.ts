import { describe, expect, it } from 'vitest';
import { computeOptimalExecution } from '@/tree/quantlib/execution/almgren-nonlinear-impact-engine';

describe('Almgren (2003) Non-linear Impact Execution Engine', () => {
  it('computes deterministic execution schedule and fully liquidates target shares', () => {
    const result = computeOptimalExecution({
      totalShares: 10_000,
      timeHorizon: 1.0,
      numSteps: 10,
      volatility: 0.3,
      riskAversion: 1e-4,
      temporaryImpactEta: 0.05,
      powerExponent: 0.5,
      permanentImpactGamma: 0.01,
    });

    expect(result.schedule).toHaveLength(10);
    const sumTraded = result.schedule.reduce((acc, step) => acc + step.tradeSize, 0);
    expect(sumTraded).toBeCloseTo(10_000, 2);
    expect(result.schedule[0].remainingShares).toBe(10_000);
    expect(result.schedule[9].tradeSize).toBeGreaterThan(0);
    expect(result.expectedCost).toBeGreaterThan(0);
    expect(result.variance).toBeGreaterThan(0);
    expect(result.utility).toBeGreaterThan(0);
    expect(result.halfLife).toBeGreaterThan(0);
  });

  it('accelerates trading speed when risk aversion increases', () => {
    const lowRiskAversion = computeOptimalExecution({
      totalShares: 5_000,
      timeHorizon: 1.0,
      numSteps: 5,
      volatility: 0.25,
      riskAversion: 1e-5,
      temporaryImpactEta: 0.02,
    });

    const highRiskAversion = computeOptimalExecution({
      totalShares: 5_000,
      timeHorizon: 1.0,
      numSteps: 5,
      volatility: 0.25,
      riskAversion: 1e-2,
      temporaryImpactEta: 0.02,
    });

    // High risk aversion trades more aggressively early on to minimize variance
    expect(highRiskAversion.schedule[0].tradeSize).toBeGreaterThan(lowRiskAversion.schedule[0].tradeSize);
    expect(highRiskAversion.halfLife).toBeLessThan(lowRiskAversion.halfLife);
  });

  it('handles single step execution boundary gracefully', () => {
    const singleStep = computeOptimalExecution({
      totalShares: 1_000,
      timeHorizon: 0.1,
      numSteps: 1,
      volatility: 0.2,
      riskAversion: 1e-3,
      temporaryImpactEta: 0.01,
    });

    expect(singleStep.schedule).toHaveLength(1);
    expect(singleStep.schedule[0].tradeSize).toBe(1_000);
  });
});
