import { describe, it, expect } from 'vitest';
import { HayashiYoshidaEngine } from '../../src/tree/quantlib/leadlag/hayashi-yoshida-engine';
import type { AsynchronousTick } from '../../src/tree/quantlib/leadlag/hayashi-yoshida-types';

describe('Hayashi-Yoshida (2005) Asynchronous Lead-Lag Engine', () => {
  it('handles small observation counts gracefully', () => {
    const engine = new HayashiYoshidaEngine({ minObservations: 5 });
    const ticks: AsynchronousTick[] = [
      { timestampMs: 1000, price: 100 },
      { timestampMs: 2000, price: 101 },
    ];
    const result = engine.computeAsynchronousCrossCorrelation(ticks, ticks);
    expect(result.peakCorrelation).toBe(0);
    expect(result.allLagMetrics).toHaveLength(0);
  });

  it('detects strong instantaneous correlation for identical asynchronous series', () => {
    const engine = new HayashiYoshidaEngine({
      maxLagMs: 200,
      lagStepMs: 100,
      minObservations: 4,
    });
    const ticks: AsynchronousTick[] = [
      { timestampMs: 0, price: 100 },
      { timestampMs: 150, price: 102 },
      { timestampMs: 320, price: 101 },
      { timestampMs: 500, price: 104 },
      { timestampMs: 700, price: 103 },
    ];
    const result = engine.computeAsynchronousCrossCorrelation(ticks, ticks);
    expect(result.instantaneousCorrelation).toBeCloseTo(1.0, 2);
    expect(result.optimalLagMs).toBe(0);
  });

  it('identifies lead-lag displacement when asset Y lags behind asset X', () => {
    const engine = new HayashiYoshidaEngine({
      maxLagMs: 500,
      lagStepMs: 100,
      minObservations: 4,
    });
    // Asset X moves at t = 0, 200, 400, 600
    const ticksX: AsynchronousTick[] = [
      { timestampMs: 0, price: 100 },
      { timestampMs: 200, price: 105 },
      { timestampMs: 400, price: 102 },
      { timestampMs: 600, price: 108 },
      { timestampMs: 800, price: 106 },
    ];
    // Asset Y copies asset X with ~200ms lag
    const ticksY: AsynchronousTick[] = [
      { timestampMs: 200, price: 100 },
      { timestampMs: 400, price: 105 },
      { timestampMs: 600, price: 102 },
      { timestampMs: 800, price: 108 },
      { timestampMs: 1000, price: 106 },
    ];

    const result = engine.computeAsynchronousCrossCorrelation(ticksX, ticksY);
    expect(result.allLagMetrics.length).toBeGreaterThan(0);
    expect(result.peakCorrelation).toBeGreaterThan(0.5);
  });
});
