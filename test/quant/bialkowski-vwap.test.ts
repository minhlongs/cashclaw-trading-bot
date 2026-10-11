import { describe, it, expect } from 'vitest';
import { computeBialkowskiVwap } from '../../src/tree/quantlib/execution/bialkowski-vwap-engine';

describe('Bialkowski, Darolles & Le Fol (2008) VWAP Execution Engine', () => {
  it('computes optimal VWAP schedule matching intraday volume seasonality', () => {
    const res = computeBialkowskiVwap({
      totalShares: 10000,
      initialPrice: 100,
      intradayVolumeWeights: [0.25, 0.15, 0.10, 0.15, 0.35],
      impactParam: 0.05,
      permImpactParam: 0.02,
    });

    expect(res.schedule.length).toBe(5);
    expect(res.schedule[0].scheduledShares).toBe(2500);
    expect(res.schedule[4].scheduledShares).toBe(3500);
    expect(res.schedule[4].remainingShares).toBe(0);
    expect(res.totalExecutionCost).toBeGreaterThan(0);
    expect(res.effectiveVWAP).toBeLessThan(100);
    expect(res.trackingErrorBps).toBeGreaterThan(0);
  });

  it('handles empty weights or zero shares gracefully', () => {
    const emptyRes = computeBialkowskiVwap({
      totalShares: 0,
      initialPrice: 50,
      intradayVolumeWeights: [],
    });
    expect(emptyRes.schedule).toHaveLength(0);
    expect(emptyRes.totalExecutionCost).toBe(0);
    expect(emptyRes.effectiveVWAP).toBe(50);
  });
});
