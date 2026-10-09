import { describe, it, expect } from 'vitest';
import { ContStoikovLOBQueueEngine } from '../../src/tree/quantlib/microstructure/cont-stoikov-lob-queue';

describe('ContStoikovLOBQueueEngine', () => {
  const engine = new ContStoikovLOBQueueEngine();

  it('calculates queue fill probability and micro-price correctly under balanced conditions', () => {
    const result = engine.calculateQueueDynamics({
      bestBid: 100.0,
      bestAsk: 100.2,
      bidVolume: 50,
      askVolume: 50,
      queuePosition: 10,
      totalLevelVolume: 50,
      marketArrivalRate: 5,
      cancelRate: 2,
    });

    expect(result.midPrice).toBe(100.1);
    expect(result.orderFlowImbalance).toBe(0);
    expect(result.microPrice).toBe(100.1);
    expect(result.fillProbability).toBeGreaterThan(0.5);
    expect(result.expectedWaitTimeMs).toBeGreaterThan(0);
  });

  it('shifts micro-price towards ask when bid volume heavily outweighs ask volume', () => {
    const result = engine.calculateQueueDynamics({
      bestBid: 3000.0,
      bestAsk: 3002.0,
      bidVolume: 90,
      askVolume: 10,
      queuePosition: 5,
      totalLevelVolume: 100,
      marketArrivalRate: 8,
      cancelRate: 2,
    });

    expect(result.orderFlowImbalance).toBe(0.8);
    expect(result.microPrice).toBeGreaterThan(result.midPrice);
    expect(result.isDepletionLikely).toBe(true);
  });

  it('handles edge cases gracefully with zero depth or zero arrival rates', () => {
    const result = engine.calculateQueueDynamics({
      bestBid: 50.0,
      bestAsk: 50.5,
      bidVolume: 0,
      askVolume: 0,
      queuePosition: 0,
      totalLevelVolume: 0,
      marketArrivalRate: 0,
      cancelRate: 0,
    });

    expect(result.midPrice).toBe(50.25);
    expect(result.microPrice).toBe(50.25);
    expect(result.fillProbability).toBe(0);
    expect(result.expectedWaitTimeMs).toBe(0);
    expect(result.isDepletionLikely).toBe(false);
  });
});
