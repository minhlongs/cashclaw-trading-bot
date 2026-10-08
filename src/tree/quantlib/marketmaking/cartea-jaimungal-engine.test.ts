import { describe, expect, it } from 'vitest';
import { CarteaJaimungalEngine } from './cartea-jaimungal-engine';
import { GtmEngine } from './gtm-engine';

describe('CarteaJaimungalEngine', () => {
  const baseParams = {
    gamma: 0.1,
    kappa: 1.5,
    A: 140,
    sigma: 0.02,
  };

  it('throws when model parameters are non-positive', () => {
    expect(() => new CarteaJaimungalEngine({ ...baseParams, gamma: 0 })).toThrow(
      'All Cartea-Jaimungal parameters (gamma, kappa, A, sigma) must be strictly positive.',
    );
    expect(() => new CarteaJaimungalEngine({ ...baseParams, kappa: -1 })).toThrow();
    expect(() => new CarteaJaimungalEngine({ ...baseParams, A: 0 })).toThrow();
    expect(() => new CarteaJaimungalEngine({ ...baseParams, sigma: -0.05 })).toThrow();
  });

  it('throws on invalid midPrice', () => {
    const engine = new CarteaJaimungalEngine(baseParams);
    expect(() => engine.computeOptimalQuotes(0, 0, 0)).toThrow('Mid price must be positive and finite.');
    expect(() => engine.computeOptimalQuotes(0, -100, 0)).toThrow('Mid price must be positive and finite.');
    expect(() => engine.computeOptimalQuotes(0, Number.NaN, 0)).toThrow();
  });

  it('matches GTM model exactly when alpha drift is zero', () => {
    const cartea = new CarteaJaimungalEngine(baseParams);
    const gtm = new GtmEngine(baseParams);

    const carteaQuote = cartea.computeOptimalQuotes(2, 50000, 0);
    const gtmQuote = gtm.computeOptimalSpreads(2);

    expect(carteaQuote.deltaBid).toBeCloseTo(gtmQuote.deltaBid, 8);
    expect(carteaQuote.deltaAsk).toBeCloseTo(gtmQuote.deltaAsk, 8);
    expect(carteaQuote.totalSpread).toBeCloseTo(gtmQuote.totalSpread, 8);
  });

  it('generates symmetric spreads when inventory is zero and drift is zero', () => {
    const engine = new CarteaJaimungalEngine(baseParams);
    const quote = engine.computeOptimalQuotes(0, 1000, 0);

    expect(quote.deltaBid).toBeCloseTo(quote.deltaAsk, 8);
    expect(quote.skew).toBeCloseTo(0, 8);
    expect(quote.bidPrice).toBeCloseTo(1000 - quote.deltaBid, 8);
    expect(quote.askPrice).toBeCloseTo(1000 + quote.deltaAsk, 8);
  });

  it('skews quotes upward when alpha drift is positive (bullish drift)', () => {
    const engine = new CarteaJaimungalEngine(baseParams);
    const neutral = engine.computeOptimalQuotes(0, 1000, 0);
    const bullish = engine.computeOptimalQuotes(0, 1000, 0.15);

    // delta_b narrows (bid moves closer to mid, bidPrice increases)
    expect(bullish.deltaBid).toBeLessThan(neutral.deltaBid);
    expect(bullish.bidPrice).toBeGreaterThan(neutral.bidPrice);

    // delta_a widens (ask moves further from mid, askPrice increases)
    expect(bullish.deltaAsk).toBeGreaterThan(neutral.deltaAsk);
    expect(bullish.askPrice).toBeGreaterThan(neutral.askPrice);

    // Positive reservation skew
    expect(bullish.skew).toBeGreaterThan(0);
    expect(bullish.skew).toBeCloseTo(0.15 / baseParams.kappa, 8);

    // Total spread remains invariant to alpha
    expect(bullish.totalSpread).toBeCloseTo(neutral.totalSpread, 8);
  });

  it('skews quotes downward when alpha drift is negative (bearish drift)', () => {
    const engine = new CarteaJaimungalEngine(baseParams);
    const neutral = engine.computeOptimalQuotes(0, 1000, 0);
    const bearish = engine.computeOptimalQuotes(0, 1000, -0.3);

    // delta_b widens, delta_a narrows
    expect(bearish.deltaBid).toBeGreaterThan(neutral.deltaBid);
    expect(bearish.deltaAsk).toBeLessThan(neutral.deltaAsk);
    expect(bearish.skew).toBeLessThan(0);
    expect(bearish.skew).toBeCloseTo(-0.3 / baseParams.kappa, 8);
    expect(bearish.totalSpread).toBeCloseTo(neutral.totalSpread, 8);
  });

  it('penalizes inventory appropriately when long or short', () => {
    const engine = new CarteaJaimungalEngine(baseParams);
    const longQuote = engine.computeOptimalQuotes(5, 1000, 0);
    const shortQuote = engine.computeOptimalQuotes(-5, 1000, 0);

    // Long inventory: wider bid, tighter ask (incentivizes selling)
    expect(longQuote.deltaBid).toBeGreaterThan(longQuote.deltaAsk);
    // Short inventory: tighter bid, wider ask (incentivizes buying)
    expect(shortQuote.deltaBid).toBeLessThan(shortQuote.deltaAsk);
  });

  it('handles non-finite inventory or alpha gracefully by defaulting to 0', () => {
    const engine = new CarteaJaimungalEngine(baseParams);
    const q1 = engine.computeOptimalQuotes(Number.NaN, 1000, Number.POSITIVE_INFINITY);
    expect(Number.isFinite(q1.deltaBid)).toBe(true);
    expect(Number.isFinite(q1.deltaAsk)).toBe(true);
  });

  it('exposes params and base coefficients', () => {
    const engine = new CarteaJaimungalEngine(baseParams);
    expect(engine.getParams()).toEqual(baseParams);
    const coeffs = engine.getBaseCoefficients();
    expect(coeffs.c0).toBeGreaterThan(0);
    expect(coeffs.c1).toBeGreaterThan(0);
  });
});
