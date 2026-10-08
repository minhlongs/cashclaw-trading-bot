import { describe, it, expect } from 'vitest';
import { calculateOrderBookImbalance, estimateMicroPrice } from './micro-price-estimator';
import { estimateQueuePlacement } from './queue-priority-tracker';
import { routePassiveLimitOrder } from './passive-execution-router';

describe('Smart Limit Router (SLR) Desk', () => {
  it('calculates OrderBook Imbalance correctly', () => {
    const obi = calculateOrderBookImbalance(100, 10, 101, 30);
    expect(obi.imbalanceRatio).toBe(0.25); // 10 / 40
  });

  it('estimates Micro-Price and Drift', () => {
    const obi = calculateOrderBookImbalance(100, 10, 101, 30);
    const estimate = estimateMicroPrice(obi);
    // Mid = 100.5
    // Micro = 100 * (0.75) + 101 * (0.25) = 75 + 25.25 = 100.25
    expect(estimate.midPrice).toBe(100.5);
    expect(estimate.microPrice).toBe(100.25);
    expect(estimate.driftBps).toBeLessThan(0); // Bearish pressure
  });

  it('handles invalid OBI gracefully', () => {
    const fallback = estimateMicroPrice({ bidPrice: 100, bidSize: 0, askPrice: 101, askSize: 10, imbalanceRatio: 0 });
    expect(fallback.microPrice).toBe(100.5);
  });

  it('estimates Queue Placement probabilities', () => {
    const q1 = estimateQueuePlacement(50, 10, 20, 5.0); // arrival=20/s, target=5s, lambda=100
    // req = 60, lambda=100 -> exp(-100/60)
    expect(q1.estimatedFillProbability).toBeGreaterThan(0.5);
    
    const q2 = estimateQueuePlacement(500, 10, 5, 5.0); // lambda=25, req=510
    expect(q2.estimatedFillProbability).toBeLessThan(0.1);
  });

  it('protects against toxic drift for BUY orders', () => {
    // Huge ask wall -> price pressure down -> buying is toxic
    const obi = calculateOrderBookImbalance(100, 1, 101, 100);
    const result = routePassiveLimitOrder(obi, 'buy', 1, 10, 0.5);
    expect(result.orderPlaced).toBe(false);
    expect(result.cancelTriggered).toBe(true);
    expect(result.reason).toContain('Toxic sell sweep expected');
  });

  it('places passive SELL order successfully when drift is safe', () => {
    // Normal book
    const obi = calculateOrderBookImbalance(100, 10, 101, 10);
    const result = routePassiveLimitOrder(obi, 'sell', 1, 10, 5.0);
    expect(result.orderPlaced).toBe(true);
    expect(result.cancelTriggered).toBe(false);
    expect(result.placement?.postOnly).toBe(true);
  });
});
