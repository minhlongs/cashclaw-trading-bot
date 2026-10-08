import { describe, it, expect } from 'vitest';
import { calculateSingleStepOfi } from './ofi-calculator';
import type { L2TopSnapshot } from './microstructure-types';

describe('Order Flow Imbalance (OFI) Calculator', () => {
  it('detects positive OFI on higher bid price and size', () => {
    const prev: L2TopSnapshot = {
      bidPrice: 60000,
      bidSize: 1.0,
      askPrice: 60010,
      askSize: 1.0,
      timestampMs: 1000,
    };
    const curr: L2TopSnapshot = {
      bidPrice: 60005, // Bid price increased
      bidSize: 1.5,
      askPrice: 60010, // Ask unchanged
      askSize: 1.0,
      timestampMs: 1100,
    };

    const res = calculateSingleStepOfi(prev, curr);
    expect(res.ofi).toBe(1.5);
    expect(res.normalizedOfi).toBeCloseTo(1.5 / 2.5, 4);
    expect(res.normalizedOfi).toBeGreaterThan(0);
  });

  it('detects negative OFI on dropping ask price', () => {
    const prev: L2TopSnapshot = {
      bidPrice: 60000,
      bidSize: 1.0,
      askPrice: 60010,
      askSize: 1.0,
      timestampMs: 1000,
    };
    const curr: L2TopSnapshot = {
      bidPrice: 60000,
      bidSize: 1.0,
      askPrice: 60008, // Ask price drops (sellers aggressive)
      askSize: 2.0,
      timestampMs: 1100,
    };

    const res = calculateSingleStepOfi(prev, curr);
    expect(res.ofi).toBe(-2.0);
    expect(res.normalizedOfi).toBeLessThan(0);
  });

  it('handles unchanged quotes with zero OFI', () => {
    const prev: L2TopSnapshot = {
      bidPrice: 60000,
      bidSize: 1.0,
      askPrice: 60010,
      askSize: 1.0,
      timestampMs: 1000,
    };
    const res = calculateSingleStepOfi(prev, prev);
    expect(res.ofi).toBe(0);
    expect(res.normalizedOfi).toBe(0);
  });
});
