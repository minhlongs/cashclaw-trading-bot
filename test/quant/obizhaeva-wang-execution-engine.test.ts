import { describe, it, expect } from 'vitest';
import { computeObizhaevaWangExecution } from '@/tree/quantlib/execution/obizhaeva-wang-execution-engine';

describe('Obizhaeva-Wang (2013) Resilient LOB Optimal Execution Engine', () => {
  it('conserves total liquidated shares across trajectory', () => {
    const res = computeObizhaevaWangExecution({ totalShares: 10000, numSteps: 10, resilienceRate: 0.5, timeStep: 1.0, orderBookDepth: 5000 });
    const executed = res.trajectory.reduce((sum, s) => sum + s.tradeSize, 0);
    expect(executed).toBeCloseTo(10000, 4);
    expect(res.trajectory[res.trajectory.length - 1]!.remainingShares).toBeCloseTo(0, 4);
    expect(res.impactSavings).toBeGreaterThan(0);
    expect(res.expectedCost).toBeLessThan(res.immediateCost);
  });

  it('exhibits U-shaped / symmetric boundary block trades for resilient books', () => {
    const res = computeObizhaevaWangExecution({ totalShares: 5000, numSteps: 5, resilienceRate: 1.2, timeStep: 0.5 });
    const firstTrade = res.trajectory[0]!.tradeSize;
    const lastTrade = res.trajectory[res.trajectory.length - 1]!.tradeSize;
    const midTrade = res.trajectory[2]!.tradeSize;

    expect(firstTrade).toBeCloseTo(lastTrade, 6);
    expect(firstTrade).toBeGreaterThan(midTrade);
    expect(res.resilienceFactor).toBeCloseTo(Math.exp(-1.2 * 0.5), 6);
  });

  it('handles boundary case of single execution step N=1', () => {
    const res = computeObizhaevaWangExecution({ totalShares: 1200, numSteps: 1, resilienceRate: 0.8 });
    expect(res.trajectory).toHaveLength(1);
    expect(res.trajectory[0]!.tradeSize).toBe(1200);
    expect(res.trajectory[0]!.remainingShares).toBe(0);
    expect(res.expectedCost).toBeCloseTo(res.immediateCost, 6);
  });

  it('handles zero shares or zero resilience safely without NaN', () => {
    const zeroShare = computeObizhaevaWangExecution({ totalShares: 0, numSteps: 4, resilienceRate: 0.5 });
    expect(zeroShare.expectedCost).toBe(0);
    expect(zeroShare.impactSavings).toBe(0);

    const zeroResilience = computeObizhaevaWangExecution({ totalShares: 1000, numSteps: 4, resilienceRate: 0 });
    expect(Number.isFinite(zeroResilience.expectedCost)).toBe(true);
    expect(zeroResilience.resilienceFactor).toBe(1.0);
  });
});
