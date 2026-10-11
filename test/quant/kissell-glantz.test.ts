import { describe, it, expect } from 'vitest';
import { computeKissellGlantzExecution } from '../../src/tree/quantlib/execution/kissell-glantz-engine';

describe('Kissell & Glantz (2003) Market Impact & Frontier Engine', () => {
  it('computes monotonic schedule and non-zero execution cost', () => {
    const res = computeKissellGlantzExecution({
      totalShares: 10_000,
      initialPrice: 100,
      adv: 100_000,
      volatility: 0.02,
      riskAversion: 0.1,
      numBuckets: 5,
    });

    expect(res.schedule).toHaveLength(5);
    expect(res.totalExecutionCost).toBeGreaterThan(0);
    expect(res.effectivePrice).toBeLessThan(100);
    expect(res.implementationShortfallBps).toBeGreaterThan(0);
    expect(res.totalVariance).toBeGreaterThan(0);
    expect(res.frontierUtility).toBeGreaterThan(res.totalExecutionCost);
    expect(res.schedule[4]!.remainingShares).toBe(0);
  });

  it('increases front-loading when risk aversion is high', () => {
    const lowRisk = computeKissellGlantzExecution({
      totalShares: 10_000,
      initialPrice: 100,
      adv: 100_000,
      riskAversion: 0.0,
      numBuckets: 5,
    });
    const highRisk = computeKissellGlantzExecution({
      totalShares: 10_000,
      initialPrice: 100,
      adv: 100_000,
      riskAversion: 2.0,
      numBuckets: 5,
    });

    expect(highRisk.schedule[0]!.sharesTraded).toBeGreaterThan(lowRisk.schedule[0]!.sharesTraded);
    expect(highRisk.totalVariance).toBeLessThan(lowRisk.totalVariance);
  });

  it('handles edge cases gracefully with zero shares and single bucket', () => {
    const resZero = computeKissellGlantzExecution({
      totalShares: 0,
      initialPrice: 100,
      numBuckets: 1,
    });
    expect(resZero.totalExecutionCost).toBe(0);
    expect(resZero.effectivePrice).toBe(100);
    expect(resZero.schedule[0]!.sharesTraded).toBe(0);

    const resSingle = computeKissellGlantzExecution({
      totalShares: 1000,
      initialPrice: 50,
      numBuckets: 1,
    });
    expect(resSingle.schedule[0]!.sharesTraded).toBe(1000);
    expect(resSingle.schedule[0]!.remainingShares).toBe(0);
  });
});
