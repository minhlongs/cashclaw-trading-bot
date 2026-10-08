import { describe, it, expect } from 'vitest';
import { computeVpin } from './vpin-calculator';
import type { MicrostructureTrade } from './microstructure-types';

describe('Volume-Synchronized Probability of Toxicity (VPIN)', () => {
  it('returns zero VPIN when trade flow is empty', () => {
    const res = computeVpin([], 10);
    expect(res.vpin).toBe(0);
    expect(res.isToxic).toBe(false);
  });

  it('computes low VPIN for balanced two-sided order flow', () => {
    const trades: MicrostructureTrade[] = [
      { price: 100, size: 5, side: 'buy', timestampMs: 1000 },
      { price: 100, size: 5, side: 'sell', timestampMs: 1001 },
      { price: 100, size: 5, side: 'buy', timestampMs: 1002 },
      { price: 100, size: 5, side: 'sell', timestampMs: 1003 },
    ];
    // Bucket size = 10, total 2 buckets, both having 5 buy and 5 sell -> imbalance = 0
    const res = computeVpin(trades, 10, 2);
    expect(res.sampleBucketsCount).toBe(2);
    expect(res.vpin).toBe(0);
    expect(res.isToxic).toBe(false);
  });

  it('flags toxicity on heavy one-sided order flow', () => {
    const trades: MicrostructureTrade[] = [
      { price: 100, size: 10, side: 'buy', timestampMs: 1000 },
      { price: 100, size: 10, side: 'buy', timestampMs: 1001 },
      { price: 100, size: 10, side: 'buy', timestampMs: 1002 },
    ];
    const res = computeVpin(trades, 10, 3, 0.5);
    expect(res.sampleBucketsCount).toBe(3);
    expect(res.vpin).toBe(1.0); // 100% informed buying
    expect(res.isToxic).toBe(true);
  });
});
