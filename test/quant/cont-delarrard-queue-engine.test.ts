import { describe, it, expect } from 'vitest';
import { ContDeLarrardQueueEngine } from '../../src/tree/quantlib/microstructure/cont-delarrard-queue-engine';

describe('ContDeLarrardQueueEngine', () => {
  it('yields fill probability 1.0 at front of queue and 0.0 at end of queue', () => {
    const engine = new ContDeLarrardQueueEngine({
      queueDepth: 100,
      cancellationRate: 2.0,
      orderFlowIntensity: 5.0,
    });

    const front = engine.computeFillProbability(0);
    expect(front.fillProbability).toBe(1.0);
    expect(front.isHighExecutionProbability).toBe(true);

    const back = engine.computeFillProbability(100);
    expect(back.fillProbability).toBe(0.0);
    expect(back.isHighExecutionProbability).toBe(false);
  });

  it('correctly handles zero cancellation rate limit', () => {
    const engine = new ContDeLarrardQueueEngine({
      queueDepth: 100,
      cancellationRate: 0,
      orderFlowIntensity: 10.0,
      highProbThreshold: 0.5,
    });

    const mid = engine.computeFillProbability(50);
    expect(mid.fillProbability).toBe(0.5);
    expect(mid.isHighExecutionProbability).toBe(true);
    expect(mid.gamma).toBe(0);
  });

  it('computes hyperbolic decay under active cancellation rate', () => {
    const engine = new ContDeLarrardQueueEngine({
      queueDepth: 10,
      cancellationRate: 4.0,
      orderFlowIntensity: 1.0, // gamma = 2.0
    });

    const pos2 = engine.computeFillProbability(2);
    expect(pos2.gamma).toBe(2.0);
    expect(pos2.fillProbability).toBeGreaterThan(0);
    expect(pos2.fillProbability).toBeLessThan(1);
    expect(pos2.isHighExecutionProbability).toBe(false);
  });
});
