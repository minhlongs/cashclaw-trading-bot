import { describe, expect, it } from 'vitest';
import { computeBouchaudImpact } from '../../src/tree/quantlib/impact/bouchaud-propagator-engine';
import type { PropagatorOrderTick } from '../../src/tree/quantlib/impact/bouchaud-propagator-types';

describe('Bouchaud (2004) Propagator Transient Impact Engine', () => {
  it('handles empty tick history with zero metrics', () => {
    const res = computeBouchaudImpact([], { gamma0: 0.1, tau0: 10, beta: 0.3 });
    expect(res.impactSeries).toEqual([]);
    expect(res.peakImpact).toBe(0);
    expect(res.permanentImpact).toBe(0);
    expect(res.relaxationRatio).toBe(0);
  });

  it('computes transient impact decay and non-zero peak impact for buy order sequence', () => {
    const ticks: PropagatorOrderTick[] = [
      { orderSign: 1, volume: 10 },
      { orderSign: 1, volume: 10 },
      { orderSign: 1, volume: 10 },
    ];
    const res = computeBouchaudImpact(ticks, { gamma0: 0.05, tau0: 5, beta: 0.4 });
    expect(res.impactSeries.length).toBe(3);
    expect(res.peakImpact).toBeGreaterThan(0);
    expect(res.permanentImpact).toBeGreaterThan(0);
    // Instantaneous impact for first order: G(0) * 10 = 0.05 * 10 = 0.5
    expect(res.impactSeries[0]).toBeCloseTo(0.5, 3);
  });

  it('demonstrates transient relaxation when order flow ceases or reverses', () => {
    const ticks: PropagatorOrderTick[] = [
      { orderSign: 1, volume: 5 },
      { orderSign: 1, volume: 5 },
      { orderSign: -1, volume: 5 },
      { orderSign: -1, volume: 5 },
    ];
    const res = computeBouchaudImpact(ticks, { gamma0: 0.1, tau0: 2, beta: 0.5 });
    expect(res.peakImpact).toBeGreaterThan(Math.abs(res.permanentImpact));
    expect(res.relaxationRatio).toBeGreaterThan(0);
  });
});
