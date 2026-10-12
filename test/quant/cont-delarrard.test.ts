import { describe, it, expect } from 'vitest';
import { ContDeLarrardEngine } from '@/tree/quantlib/microstructure/cont-delarrard-engine';

describe('Cont & de Larrard (2013) Markovian LOB First-Passage Queue Depletion', () => {
  it('computes symmetric depletion probabilities when queues are equal', () => {
    const res = ContDeLarrardEngine.calculate({
      bidQueueSize: 50,
      askQueueSize: 50,
      arrivalRate: 10,
      cancellationRate: 5,
      marketOrderRate: 5,
    });
    expect(res.probPriceIncrease).toBe(0.5);
    expect(res.probPriceDecrease).toBe(0.5);
    expect(res.queueImbalance).toBe(0);
    expect(res.expectedDepletionTime).toBeGreaterThan(0);
  });

  it('reflects high probability of price increase when bid queue dominates', () => {
    const res = ContDeLarrardEngine.calculate({
      bidQueueSize: 90,
      askQueueSize: 10,
    });
    expect(res.probPriceIncrease).toBe(0.9);
    expect(res.probPriceDecrease).toBe(0.1);
    expect(res.queueImbalance).toBe(0.8);
  });

  it('throws on invalid queue arguments', () => {
    expect(() => ContDeLarrardEngine.calculate({ bidQueueSize: -1, askQueueSize: 10 })).toThrow();
    expect(() => ContDeLarrardEngine.calculate({ bidQueueSize: 0, askQueueSize: 0 })).toThrow();
  });
});
