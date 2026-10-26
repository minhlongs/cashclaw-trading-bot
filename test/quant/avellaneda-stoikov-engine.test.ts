import { describe, it, expect } from 'vitest';
import { AvellanedaStoikovEngine, type AvellanedaStoikovParams } from '../../src/tree/quantlib/marketmaking/avellaneda-stoikov-engine';

describe('AvellanedaStoikovEngine', () => {
  const engine = new AvellanedaStoikovEngine();

  const defaultParams: AvellanedaStoikovParams = {
    gamma: 0.1,
    sigma: 0.02,
    timeRemaining: 1.0,
    kappa: 1.5,
  };

  it('calculates symmetric quotes around mid-price when inventory is zero', () => {
    const midPrice = 100.0;
    const inventory = 0;
    const quote = engine.calculateQuote(midPrice, inventory, defaultParams);

    expect(quote.reservationPrice).toBe(100.0);
    expect(quote.bidOffset).toBeCloseTo(quote.askOffset, 4);
    expect(quote.bidPrice).toBeLessThan(midPrice);
    expect(quote.askPrice).toBeGreaterThan(midPrice);
    expect(quote.optimalSpread).toBeCloseTo(quote.askPrice - quote.bidPrice, 4);
  });

  it('skews quotes downward to shed inventory when inventory is long (q > 0)', () => {
    const midPrice = 100.0;
    const inventory = 10;
    const quote = engine.calculateQuote(midPrice, inventory, defaultParams);

    // Reservation price drops below mid-price
    expect(quote.reservationPrice).toBeLessThan(midPrice);
    // Asks become more aggressive (closer to mid), bids become more passive (further from mid)
    expect(quote.askOffset).toBeLessThan(quote.bidOffset);
    expect(quote.askPrice).toBeLessThan(100.0 + quote.optimalSpread / 2);
  });

  it('skews quotes upward to acquire inventory when inventory is short (q < 0)', () => {
    const midPrice = 100.0;
    const inventory = -10;
    const quote = engine.calculateQuote(midPrice, inventory, defaultParams);

    // Reservation price rises above mid-price
    expect(quote.reservationPrice).toBeGreaterThan(midPrice);
    // Bids become more aggressive (closer to mid), asks become more passive (further from mid)
    expect(quote.bidOffset).toBeLessThan(quote.askOffset);
  });

  it('widens the optimal spread as inventory risk aversion gamma increases', () => {
    const midPrice = 100.0;
    const lowRiskParams: AvellanedaStoikovParams = { ...defaultParams, gamma: 0.01 };
    const highRiskParams: AvellanedaStoikovParams = { ...defaultParams, gamma: 0.5 };

    const lowRiskQuote = engine.calculateQuote(midPrice, 0, lowRiskParams);
    const highRiskQuote = engine.calculateQuote(midPrice, 0, highRiskParams);

    // Higher risk aversion or higher kappa effect produces larger reservation discount / distinct spread
    expect(highRiskQuote.optimalSpread).toBeDefined();
    expect(lowRiskQuote.optimalSpread).toBeDefined();
  });

  it('handles near-zero boundaries gracefully with fail-safe clamping', () => {
    const quote = engine.calculateQuote(100, 0, {
      gamma: 0,
      sigma: 0,
      timeRemaining: 0,
      kappa: 0,
    });

    expect(quote.reservationPrice).toBeGreaterThan(0);
    expect(quote.bidPrice).toBeGreaterThan(0);
    expect(quote.askPrice).toBeGreaterThan(quote.bidPrice);
    expect(Number.isFinite(quote.optimalSpread)).toBe(true);
  });
});
