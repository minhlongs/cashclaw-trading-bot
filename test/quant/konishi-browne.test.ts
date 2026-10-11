import { describe, it, expect } from 'vitest';
import { executeKonishiBrowne } from '../../src/tree/quantlib/execution/konishi-browne-engine';

describe('Konishi & Browne (2000) Optimal Dynamic VWAP Execution Engine', () => {
  it('computes optimal schedule balancing volume curve and risk aversion', () => {
    const res = executeKonishiBrowne({
      totalShares: 10_000,
      initialPrice: 100,
      volumeWeights: [0.3, 0.2, 0.2, 0.3],
      riskAversion: 0.1,
      volatility: 0.02,
      temporaryImpact: 0.04,
      permanentImpact: 0.01,
    });

    expect(res.schedule).toHaveLength(4);
    expect(res.schedule[3].remainingShares).toBe(0);
    expect(res.totalExecutionCost).toBeGreaterThan(0);
    expect(res.effectiveVWAP).toBeLessThanOrEqual(100);
    expect(res.trackingErrorBps).toBeGreaterThan(0);
    expect(res.benchmarkVWAP).toBe(100);
  });

  it('handles zero shares or single bucket execution gracefully', () => {
    const zeroRes = executeKonishiBrowne({
      totalShares: 0,
      initialPrice: 50,
      volumeWeights: [1],
    });
    expect(zeroRes.totalExecutionCost).toBe(0);
    expect(zeroRes.effectiveVWAP).toBe(50);
    expect(zeroRes.trackingErrorBps).toBe(0);
  });
});
