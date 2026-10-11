import { describe, it, expect } from 'vitest';
import { computeAlmgrenRiskPenalty } from '@/tree/quantlib/execution/almgren-risk-penalty-engine';

describe('Almgren & Chriss (2000) Nonlinear Risk Penalty Engine', () => {
  it('generates decaying liquidation schedule with non-zero total penalty cost', () => {
    const res = computeAlmgrenRiskPenalty({
      totalShares: 1000,
      horizonSteps: 5,
      volatility: 0.01,
      riskAversion: 0.1,
      temporaryImpactEta: 0.05,
    });
    expect(res.trajectory).toHaveLength(6);
    expect(res.trajectory[0]).toBe(1000);
    expect(res.trajectory[5]).toBeCloseTo(0, 4);
    expect(res.totalPenaltyCost).toBeGreaterThan(0);
    expect(res.urgencyKappa).toBeGreaterThan(0);
  });
});
