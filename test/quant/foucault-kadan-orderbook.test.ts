import { describe, it, expect } from 'vitest';
import { computeFoucaultKadanOrderBook } from '@/tree/quantlib/microstructure/foucault-kadan-engine';

describe('Foucault-Kadan-Kandel (2005) Limit Order Book Waiting Times Engine', () => {
  it('correctly calculates expected waiting time and optimal order choice under normal conditions', () => {
    const res = computeFoucaultKadanOrderBook({
      queueDepth: 10,
      marketOrderArrivalRate: 2.0, // 2 orders / sec
      traderImpatienceCost: 0.01,
      tickSize: 0.05,
      volatility: 0.1,
      timeLimitSec: 30,
    });

    expect(res.expectedWaitTimeSec).toBeCloseTo(5.5, 4); // (10 + 1) / 2 = 5.5
    expect(res.waitingCostPerUnit).toBeCloseTo(0.055, 4);
    expect(res.reservationSpread).toBeGreaterThan(0.05);
    expect(res.fillProbability).toBeGreaterThan(0.9);
    expect(['LIMIT', 'MARKET']).toContain(res.optimalOrderType);
  });

  it('favors MARKET orders when impatience cost is high or time limit is very short', () => {
    const res = computeFoucaultKadanOrderBook({
      queueDepth: 50,
      marketOrderArrivalRate: 0.1,
      traderImpatienceCost: 1.0,
      tickSize: 0.01,
      volatility: 0.5,
      timeLimitSec: 1, // very short horizon
    });

    expect(res.optimalOrderType).toBe('MARKET');
    expect(res.fillProbability).toBeLessThan(0.5);
  });

  it('favors LIMIT orders when queue is shallow and fill probability is high', () => {
    const res = computeFoucaultKadanOrderBook({
      queueDepth: 0,
      marketOrderArrivalRate: 5.0,
      traderImpatienceCost: 0.0001,
      tickSize: 0.1,
      volatility: 0.01,
      timeLimitSec: 60,
    });

    expect(res.optimalOrderType).toBe('LIMIT');
    expect(res.fillProbability).toBeGreaterThan(0.8);
    expect(res.expectedWaitTimeSec).toBeCloseTo(0.2, 4);
  });
});
