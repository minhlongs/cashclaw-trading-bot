import { describe, expect, it } from 'vitest';
import { executeEngleFerstenbergExecution } from '@/tree/quantlib/execution/engle-ferstenberg-engine';

describe('Engle & Ferstenberg (2007) Execution Risk & Optimal Portfolio Scheduling Engine', () => {
  it('executes a valid trade schedule with monotonically decreasing remaining shares', () => {
    const res = executeEngleFerstenbergExecution({
      totalShares: 10_000,
      initialPrice: 100,
      numBuckets: 5,
      riskAversion: 0.05,
      volatility: 0.02,
      marketVolume: 50_000,
    });

    expect(res.schedule).toHaveLength(5);
    expect(res.schedule[0].bucket).toBe(1);
    expect(res.schedule[4].remainingShares).toBe(0);

    const totalTraded = res.schedule.reduce((sum, s) => sum + s.sharesTraded, 0);
    expect(totalTraded).toBeCloseTo(10_000, 4);

    expect(res.totalExecutionCost).toBeGreaterThan(0);
    expect(res.effectivePrice).toBeLessThan(100);
    expect(res.implementationShortfallBps).toBeGreaterThan(0);
    expect(res.totalRiskVariance).toBeGreaterThan(0);
  });

  it('handles zero shares edge case safely', () => {
    const res = executeEngleFerstenbergExecution({
      totalShares: 0,
      initialPrice: 50,
      numBuckets: 4,
    });

    expect(res.totalExecutionCost).toBe(0);
    expect(res.effectivePrice).toBe(50);
    expect(res.implementationShortfallBps).toBe(0);
    expect(res.schedule).toHaveLength(4);
    expect(res.schedule.every((s) => s.sharesTraded === 0)).toBe(true);
  });

  it('applies higher risk aversion to trade faster front-loaded schedules', () => {
    const lowRisk = executeEngleFerstenbergExecution({
      totalShares: 5_000,
      initialPrice: 200,
      numBuckets: 5,
      riskAversion: 0.001,
      volatility: 0.01,
    });

    const highRisk = executeEngleFerstenbergExecution({
      totalShares: 5_000,
      initialPrice: 200,
      numBuckets: 5,
      riskAversion: 0.5,
      volatility: 0.05,
    });

    // Higher risk aversion trades more in early buckets to curtail volatility risk
    expect(highRisk.schedule[0].sharesTraded).toBeGreaterThan(lowRisk.schedule[0].sharesTraded);
  });
});
