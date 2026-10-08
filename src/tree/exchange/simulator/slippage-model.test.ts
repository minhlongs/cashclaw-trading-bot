import { describe, it, expect } from 'vitest';
import { calculateOrderBookExecution } from './slippage-model';
import type { L2OrderBookLevel } from './l2-types';

describe('calculateOrderBookExecution', () => {
  const sampleAsks: L2OrderBookLevel[] = [
    { price: 100, size: 1.0 },
    { price: 101, size: 2.0 },
    { price: 102, size: 3.0 },
  ];

  it('calculates perfect execution when filled within first level', () => {
    const res = calculateOrderBookExecution('buy', 0.5, sampleAsks, 100);
    expect(res.executedPrice).toBe(100);
    expect(res.slippageBps).toBe(0);
    expect(res.totalCost).toBe(50);
  });

  it('walks order book levels and computes weighted average price and slippage', () => {
    // Buy 2.0: 1.0 @ 100 + 1.0 @ 101 = 201 total cost -> avg price = 100.5
    const res = calculateOrderBookExecution('buy', 2.0, sampleAsks, 100);
    expect(res.executedPrice).toBe(100.5);
    expect(res.totalCost).toBe(201);
    // (100.5 - 100) / 100 = 0.005 -> 50 bps
    expect(res.slippageBps).toBeCloseTo(50, 2);
  });

  it('applies penalty when requested size exceeds depth', () => {
    // Total available depth is 6.0 (1.0 + 2.0 + 3.0)
    // Request 8.0: 6.0 at book prices + 2.0 at penalty price (102 * 1.01 = 103.02)
    const res = calculateOrderBookExecution('buy', 8.0, sampleAsks, 100);
    expect(res.executedPrice).toBeCloseTo(101.755, 3);
    expect(res.slippageBps).toBeGreaterThan(150);
  });

  it('throws on non-positive size or empty levels', () => {
    expect(() => calculateOrderBookExecution('buy', 0, sampleAsks, 100)).toThrow();
    expect(() => calculateOrderBookExecution('buy', 1.0, [], 100)).toThrow();
  });
});
