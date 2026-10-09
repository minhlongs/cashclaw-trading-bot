import { describe, expect, it } from 'vitest';
import { computeHubermanStanzlExecution } from '@/tree/quantlib/execution/huberman-stanzl-engine';

describe('Huberman-Stanzl (2004) Price Manipulation & Non-Arbitrage Execution Engine', () => {
  it('executes full block without terminal residual shares', () => {
    const res = computeHubermanStanzlExecution({
      totalShares: 1000,
      timeHorizon: 1.0,
      numSteps: 10,
      permanentImpactCoeff: 0.001,
      temporaryImpactCoeff: 0.005,
      riskAversion: 0.0001,
      initialPrice: 100,
    });
    expect(res.terminalShares).toBe(0);
    expect(res.trajectory.length).toBe(10);
    expect(res.isManipulationFree).toBe(true);
    expect(res.quasiArbitrageMetric).toBe(0);
    expect(res.totalCost).toBeGreaterThan(0);
    expect(res.vwapPrice).toBeGreaterThan(100);
  });

  it('flags negative permanent impact as non-manipulation-free (quasi-arbitrage condition)', () => {
    const res = computeHubermanStanzlExecution({
      totalShares: 500,
      timeHorizon: 1.0,
      numSteps: 5,
      permanentImpactCoeff: -0.002,
      temporaryImpactCoeff: 0.005,
      riskAversion: 0.0001,
      initialPrice: 100,
    });
    expect(res.isManipulationFree).toBe(false);
    expect(res.quasiArbitrageMetric).toBeGreaterThan(0);
  });

  it('monotonically decreases remaining inventory across trajectory', () => {
    const res = computeHubermanStanzlExecution({
      totalShares: 2000,
      timeHorizon: 2.0,
      numSteps: 8,
      permanentImpactCoeff: 0.0005,
      temporaryImpactCoeff: 0.002,
      riskAversion: 0.0005,
      initialPrice: 50,
    });
    for (let i = 1; i < res.trajectory.length; i++) {
      expect(res.trajectory[i].sharesRemaining).toBeLessThanOrEqual(res.trajectory[i - 1].sharesRemaining);
    }
  });

  it('handles zero total shares gracefully', () => {
    const res = computeHubermanStanzlExecution({
      totalShares: 0,
      timeHorizon: 1.0,
      numSteps: 5,
      permanentImpactCoeff: 0.001,
      temporaryImpactCoeff: 0.005,
      riskAversion: 0.001,
      initialPrice: 100,
    });
    expect(res.terminalShares).toBe(0);
    expect(res.totalCost).toBe(0);
    expect(res.vwapPrice).toBe(100);
  });
});
