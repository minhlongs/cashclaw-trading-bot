import { describe, it, expect } from 'vitest';
import { executeBiaisScheduling } from '@/tree/quantlib/execution/biais-scheduling-engine';

describe('Biais, Bisière & Bouvard (2014) Optimal High-Frequency Trade Scheduling Engine', () => {
  it('executes full order over specified arrival buckets with zero residual shares', () => {
    const res = executeBiaisScheduling({
      totalShares: 1000,
      initialPrice: 100,
      numBuckets: 5,
      informedArrivalProb: 0.25,
      adverseIntensity: 0.04,
      latencyCostRate: 0.0005,
      baseImpact: 0.01,
    });

    expect(res.schedule).toHaveLength(5);
    expect(res.schedule[4].remainingShares).toBe(0);
    const totalTraded = res.schedule.reduce((acc, s) => acc + s.sharesTraded, 0);
    expect(totalTraded).toBeCloseTo(1000, 4);
    expect(res.totalExecutionCost).toBeGreaterThan(0);
    expect(res.effectivePrice).toBeLessThan(100);
    expect(res.implementationShortfallBps).toBeGreaterThan(0);
  });

  it('handles edge case of zero shares gracefully', () => {
    const res = executeBiaisScheduling({
      totalShares: 0,
      initialPrice: 50,
      numBuckets: 4,
    });

    expect(res.schedule).toHaveLength(4);
    expect(res.totalExecutionCost).toBe(0);
    expect(res.effectivePrice).toBe(50);
    expect(res.implementationShortfallBps).toBe(0);
  });

  it('reflects higher shortfall under higher probability of informed arrival', () => {
    const lowInformed = executeBiaisScheduling({
      totalShares: 500,
      initialPrice: 100,
      informedArrivalProb: 0.05,
      numBuckets: 6,
    });

    const highInformed = executeBiaisScheduling({
      totalShares: 500,
      initialPrice: 100,
      informedArrivalProb: 0.8,
      numBuckets: 6,
    });

    expect(highInformed.totalExecutionCost).toBeGreaterThan(lowInformed.totalExecutionCost);
    expect(highInformed.implementationShortfallBps).toBeGreaterThan(lowInformed.implementationShortfallBps);
  });
});
