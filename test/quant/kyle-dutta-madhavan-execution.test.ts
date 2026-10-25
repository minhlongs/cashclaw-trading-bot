import { describe, expect, it } from 'vitest';
import { computeKyleDuttaMadhavanExecution, type KyleDuttaMadhavanParams } from '@/tree/quantlib/execution/kyle-dutta-madhavan-engine';

describe('KyleDuttaMadhavanExecutionEngine', () => {
  const baseParams: KyleDuttaMadhavanParams = {
    totalShares: 10_000,
    timeHorizon: 1.0,
    numSteps: 5,
    numDealers: 4,
    dealerRiskAversion: 0.1,
    adverseSelectionBase: 0.05,
    traderRiskAversion: 0.01,
    impactParam: 0.02,
  };

  it('liquidates entire order by terminal step', () => {
    const res = computeKyleDuttaMadhavanExecution(baseParams);
    expect(res.trajectory.length).toBe(5);
    expect(res.terminalShares).toBe(0);
    const lastStep = res.trajectory[res.trajectory.length - 1];
    expect(lastStep.sharesRemaining).toBe(0);
  });

  it('compresses effective lambda under competitive multi-dealer regime', () => {
    const m2 = computeKyleDuttaMadhavanExecution({ ...baseParams, numDealers: 2 });
    const m5 = computeKyleDuttaMadhavanExecution({ ...baseParams, numDealers: 5 });
    expect(m5.trajectory[0].effectiveLambda).toBeLessThan(m2.trajectory[0].effectiveLambda);
    expect(m5.trajectory[0].effectiveLambda).toBeCloseTo(0.05 / 5, 5);
  });

  it('achieves cost savings over uniform benchmark TWAP', () => {
    const res = computeKyleDuttaMadhavanExecution(baseParams);
    expect(res.expectedCost).toBeGreaterThan(0);
    expect(res.benchmarkTwapCost).toBeGreaterThan(0);
    expect(res.costSavings).toBeGreaterThanOrEqual(0);
  });

  it('handles zero or single share edge conditions gracefully', () => {
    const resZero = computeKyleDuttaMadhavanExecution({ ...baseParams, totalShares: 0 });
    expect(resZero.expectedCost).toBe(0);
    expect(resZero.terminalShares).toBe(0);
  });
});
