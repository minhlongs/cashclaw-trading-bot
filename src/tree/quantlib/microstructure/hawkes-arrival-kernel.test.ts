import { describe, it, expect } from 'vitest';
import {
  computeHawkesIntensity,
  computeOrderBookImbalance,
} from './hawkes-arrival-kernel';

describe('Hawkes Self-Exciting Arrival Kernel & Multi-Level OBI', () => {
  it('computes stationary PASSIVE_MAKER intensity when few arrivals occur', () => {
    const res = computeHawkesIntensity([1000, 5000], 6000, {
      baselineMu: 1.2,
      excitationAlpha: 0.4,
      decayBeta: 1.5,
    });
    expect(res.isStationary).toBe(true);
    expect(res.branchingRatioEta).toBeCloseTo(0.2667, 3);
    expect(res.expectedClusterSize).toBeGreaterThan(1);
    expect(res.routingVerdict).toBe('PASSIVE_MAKER');
  });

  it('triggers TWAP_SLICE under moderate self-exciting burst', () => {
    const res = computeHawkesIntensity([4800, 4900, 4950, 4990], 5000, {
      baselineMu: 1.0,
      excitationAlpha: 0.4,
      decayBeta: 0.8,
    });
    expect(res.isStationary).toBe(true);
    expect(res.intensityLambda).toBeGreaterThanOrEqual(1.8);
    expect(res.routingVerdict).toBe('TWAP_SLICE');
  });

  it('triggers HALT_TOXIC_SWEEP when supercritical (eta >= 1) or extreme burst', () => {
    const superCrit = computeHawkesIntensity([1000, 2000], 1500, {
      baselineMu: 1.0,
      excitationAlpha: 1.6,
      decayBeta: 1.2,
    });
    expect(superCrit.isStationary).toBe(false);
    expect(superCrit.expectedClusterSize).toBe(999.99);
    expect(superCrit.routingVerdict).toBe('HALT_TOXIC_SWEEP');

    const extremeBurst = computeHawkesIntensity([4950, 4960, 4970, 4980, 4990], 5000, {
      baselineMu: 0.8,
      excitationAlpha: 0.7,
      decayBeta: 1.0,
    });
    expect(extremeBurst.isStationary).toBe(true);
    expect(extremeBurst.routingVerdict).toBe('HALT_TOXIC_SWEEP');
  });

  it('computes multi-level orderbook imbalance and handles empty or zero depth', () => {
    expect(computeOrderBookImbalance([], [])).toEqual({
      obi: 0,
      microPriceSkewBps: 0,
      bidDepthSum: 0,
      askDepthSum: 0,
    });
    expect(computeOrderBookImbalance([0, 0], [0, 0]).obi).toBe(0);

    const buyPressure = computeOrderBookImbalance([120, 90, 60], [40, 30, 20]);
    expect(buyPressure.obi).toBeGreaterThan(0.4);
    expect(buyPressure.microPriceSkewBps).toBeGreaterThan(1.5);
    expect(buyPressure.bidDepthSum).toBe(270);
    expect(buyPressure.askDepthSum).toBe(90);
  });
});
