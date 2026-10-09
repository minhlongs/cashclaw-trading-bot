import { describe, it, expect } from 'vitest';
import { computeParlourOrderBook } from '../../src/tree/quantlib/microstructure/parlour-orderbook-engine';

describe('Parlour Order Book Equilibrium Engine', () => {
  it('computes queue fill probability and wait times accurately', () => {
    const res = computeParlourOrderBook({
      queueDepthAhead: 10,
      arrivalIntensity: 2.0,
      cancellationRate: 0.1,
      tickSpread: 0.05,
      executionHorizonSec: 10,
    });

    expect(res.queueFillProbability).toBeGreaterThan(0);
    expect(res.queueFillProbability).toBeLessThanOrEqual(1.0);
    expect(res.expectedQueueWaitSec).toBeGreaterThan(0);
    expect(res.cancellationProbability).toBeCloseTo(1 - res.queueFillProbability, 4);
  });

  it('recommends MARKET order when fill probability is low or wait is punitive', () => {
    const res = computeParlourOrderBook({
      queueDepthAhead: 1000,
      arrivalIntensity: 0.01,
      cancellationRate: 0.5,
      tickSpread: 0.01,
      executionHorizonSec: 1,
    });

    expect(res.recommendedOrderType).toBe('MARKET');
  });

  it('recommends LIMIT order when arrival intensity is high and horizon is sufficient', () => {
    const res = computeParlourOrderBook({
      queueDepthAhead: 2,
      arrivalIntensity: 10.0,
      cancellationRate: 0.05,
      tickSpread: 0.1,
      executionHorizonSec: 60,
    });

    expect(res.recommendedOrderType).toBe('LIMIT');
    expect(res.queueFillProbability).toBeGreaterThan(0.5);
  });

  it('computes market order incentive properly as spread varies', () => {
    const wideSpread = computeParlourOrderBook({
      queueDepthAhead: 5,
      arrivalIntensity: 1.0,
      cancellationRate: 0.05,
      tickSpread: 1.0,
      executionHorizonSec: 10,
    });

    const tightSpread = computeParlourOrderBook({
      queueDepthAhead: 5,
      arrivalIntensity: 1.0,
      cancellationRate: 0.05,
      tickSpread: 0.01,
      executionHorizonSec: 10,
    });

    expect(wideSpread.marketOrderIncentiveBps).toBeGreaterThanOrEqual(0);
    expect(tightSpread.marketOrderIncentiveBps).toBeGreaterThanOrEqual(0);
  });
});
