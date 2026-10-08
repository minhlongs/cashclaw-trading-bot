import { describe, it, expect, beforeEach } from 'vitest';
import { GtmEngine } from './gtm-engine';
import { OfiEngine } from './ofi-engine';
import type { L2OrderBookSnapshot } from './gtm-types';

describe('Guéant-Tapia-Manziadi (2012) Market Making Engine', () => {
  const baseParams = {
    gamma: 0.1,
    kappa: 1.5,
    A: 140,
    sigma: 0.02,
  };

  it('validates strictly positive model parameters', () => {
    expect(() => new GtmEngine({ ...baseParams, gamma: 0 })).toThrow(/positive/);
    expect(() => new GtmEngine({ ...baseParams, kappa: -1 })).toThrow(/positive/);
    expect(() => new GtmEngine({ ...baseParams, A: 0 })).toThrow(/positive/);
    expect(() => new GtmEngine({ ...baseParams, sigma: -0.05 })).toThrow(/positive/);
  });

  it('calculates symmetric spreads for neutral inventory (q = 0)', () => {
    const engine = new GtmEngine(baseParams);
    const spreads = engine.computeOptimalSpreads(0);

    expect(spreads.deltaBid).toBeGreaterThan(0);
    expect(spreads.deltaAsk).toBeGreaterThan(0);
    expect(spreads.deltaBid).toBeCloseTo(spreads.deltaAsk, 6);
    expect(spreads.totalSpread).toBeCloseTo(spreads.deltaBid + spreads.deltaAsk, 6);
  });

  it('exhibits correct inventory skew monotonicity for long inventory (q > 0)', () => {
    const engine = new GtmEngine(baseParams);
    const neutral = engine.computeOptimalSpreads(0);
    const longSpreads = engine.computeOptimalSpreads(5);

    // When long inventory (q = 5), dealer wants to sell:
    // deltaBid increases (bid is posted further down from mid-price)
    expect(longSpreads.deltaBid).toBeGreaterThan(neutral.deltaBid);
    // deltaAsk decreases (ask is posted closer to mid-price to attract buyers)
    expect(longSpreads.deltaAsk).toBeLessThan(neutral.deltaAsk);
  });

  it('exhibits correct inventory skew monotonicity for short inventory (q < 0)', () => {
    const engine = new GtmEngine(baseParams);
    const neutral = engine.computeOptimalSpreads(0);
    const shortSpreads = engine.computeOptimalSpreads(-5);

    // When short inventory (q = -5), dealer wants to buy:
    // deltaBid decreases (bid is posted closer to mid-price to attract sellers)
    expect(shortSpreads.deltaBid).toBeLessThan(neutral.deltaBid);
    // deltaAsk increases (ask is posted further up)
    expect(shortSpreads.deltaAsk).toBeGreaterThan(neutral.deltaAsk);
  });

  it('handles non-finite inventory inputs safely', () => {
    const engine = new GtmEngine(baseParams);
    const spreads = engine.computeOptimalSpreads(NaN);
    const neutral = engine.computeOptimalSpreads(0);
    expect(spreads.deltaBid).toBeCloseTo(neutral.deltaBid, 6);
  });

  it('returns getters for params and base coefficients', () => {
    const engine = new GtmEngine(baseParams);
    expect(engine.getParams()).toEqual(baseParams);
    const { c0, c1 } = engine.getBaseCoefficients();
    expect(c0).toBeGreaterThan(0);
    expect(c1).toBeGreaterThan(0);
  });
});

describe('Order Flow Imbalance (OFI) Engine', () => {
  let ofiEngine: OfiEngine;
  let gtmEngine: GtmEngine;

  beforeEach(() => {
    ofiEngine = new OfiEngine({ beta: 0.05, maxShiftRatio: 0.01 });
    gtmEngine = new GtmEngine({ gamma: 0.1, kappa: 1.5, A: 140, sigma: 0.02 });
  });

  it('rejects negative beta parameter', () => {
    expect(() => new OfiEngine({ beta: -0.1 })).toThrow(/non-negative/);
  });

  it('returns 0 OFI on initial snapshot', () => {
    const book: L2OrderBookSnapshot = {
      bid: { price: 100, size: 10 },
      ask: { price: 101, size: 10 },
    };
    expect(ofiEngine.computeOfi(book)).toBe(0);
  });

  it('detects positive OFI when bid price rises', () => {
    ofiEngine.computeOfi({ bid: { price: 100, size: 10 }, ask: { price: 101, size: 10 } });
    const ofi = ofiEngine.computeOfi({ bid: { price: 100.5, size: 15 }, ask: { price: 101, size: 10 } });
    expect(ofi).toBe(15);
  });

  it('detects OFI when bid size changes at same price', () => {
    ofiEngine.computeOfi({ bid: { price: 100, size: 10 }, ask: { price: 101, size: 10 } });
    const ofi = ofiEngine.computeOfi({ bid: { price: 100, size: 18 }, ask: { price: 101, size: 10 } });
    expect(ofi).toBe(8);
  });

  it('detects negative OFI when bid price drops', () => {
    ofiEngine.computeOfi({ bid: { price: 100, size: 10 }, ask: { price: 101, size: 10 } });
    const ofi = ofiEngine.computeOfi({ bid: { price: 99.5, size: 12 }, ask: { price: 101, size: 10 } });
    expect(ofi).toBe(-10);
  });

  it('detects OFI when ask price falls (aggressive selling)', () => {
    ofiEngine.computeOfi({ bid: { price: 100, size: 10 }, ask: { price: 101, size: 10 } });
    const ofi = ofiEngine.computeOfi({ bid: { price: 100, size: 10 }, ask: { price: 100.5, size: 8 } });
    expect(ofi).toBe(-8);
  });

  it('detects OFI when ask price rises', () => {
    ofiEngine.computeOfi({ bid: { price: 100, size: 10 }, ask: { price: 101, size: 10 } });
    const ofi = ofiEngine.computeOfi({ bid: { price: 100, size: 10 }, ask: { price: 101.5, size: 8 } });
    expect(ofi).toBe(10);
  });

  it('calculates integrated quotes with OFI reservation price skew and clamping', () => {
    const book1: L2OrderBookSnapshot = { bid: { price: 100, size: 10 }, ask: { price: 101, size: 10 } };
    ofiEngine.computeOfi(book1);

    const book2: L2OrderBookSnapshot = { bid: { price: 100, size: 1000 }, ask: { price: 101, size: 10 } };
    const quotes = ofiEngine.calculateQuotes(book2, 0, gtmEngine);

    expect(quotes.midPrice).toBe(100.5);
    expect(quotes.ofiAdjustment).toBeGreaterThan(0);
    // Reservation price should be higher due to buying pressure
    expect(quotes.reservationPrice).toBeGreaterThan(quotes.midPrice);
    expect(quotes.bidPrice).toBeLessThan(quotes.reservationPrice);
    expect(quotes.askPrice).toBeGreaterThan(quotes.reservationPrice);
  });

  it('resets snapshot state properly', () => {
    ofiEngine.computeOfi({ bid: { price: 100, size: 10 }, ask: { price: 101, size: 10 } });
    ofiEngine.reset();
    expect(ofiEngine.computeOfi({ bid: { price: 105, size: 20 }, ask: { price: 106, size: 20 } })).toBe(0);
  });
});
