import { describe, it, expect } from 'vitest';
import { StoikovMicroPriceEngine } from '../../src/tree/quantlib/microstructure/stoikov-microprice-engine';
import type { StoikovOrderBookL1 } from '../../src/tree/quantlib/microstructure/stoikov-microprice-types';

describe('StoikovMicroPriceEngine', () => {
  const engine = new StoikovMicroPriceEngine();

  it('throws when bid is non-positive or bid >= ask', () => {
    expect(() => engine.calculate({ bidPrice: 0, askPrice: 100, bidVolume: 10, askVolume: 10 })).toThrow(/Invalid book quotes/);
    expect(() => engine.calculate({ bidPrice: 100, askPrice: 100, bidVolume: 10, askVolume: 10 })).toThrow(/Invalid book quotes/);
    expect(() => engine.calculate({ bidPrice: 101, askPrice: 100, bidVolume: 10, askVolume: 10 })).toThrow(/Invalid book quotes/);
  });

  it('throws when total volume is non-positive', () => {
    expect(() => engine.calculate({ bidPrice: 100, askPrice: 101, bidVolume: 0, askVolume: 0 })).toThrow(/Total book volume must be strictly positive/);
  });

  it('calculates micro-price exactly at mid-price when book is balanced (imbalance = 0)', () => {
    const book: StoikovOrderBookL1 = {
      bidPrice: 100,
      askPrice: 102,
      bidVolume: 50,
      askVolume: 50,
    };
    const res = engine.calculate(book);
    expect(res.midPrice).toBe(101);
    expect(res.spread).toBe(2);
    expect(res.imbalance).toBe(0);
    expect(res.probabilityUp).toBe(0.5);
    expect(res.microPrice).toBe(101);
    expect(res.driftBps).toBe(0);
  });

  it('shifts micro-price towards ask when bid volume dominates (positive imbalance)', () => {
    const book: StoikovOrderBookL1 = {
      bidPrice: 100,
      askPrice: 102,
      bidVolume: 90,
      askVolume: 10,
    };
    const res = engine.calculate(book);
    expect(res.midPrice).toBe(101);
    expect(res.imbalance).toBe(0.8);
    expect(res.probabilityUp).toBeGreaterThan(0.5);
    expect(res.microPrice).toBeGreaterThan(101);
    expect(res.microPrice).toBeLessThanOrEqual(102);
    expect(res.driftBps).toBeGreaterThan(0);
  });

  it('shifts micro-price towards bid when ask volume dominates (negative imbalance)', () => {
    const book: StoikovOrderBookL1 = {
      bidPrice: 100,
      askPrice: 102,
      bidVolume: 10,
      askVolume: 90,
    };
    const res = engine.calculate(book);
    expect(res.midPrice).toBe(101);
    expect(res.imbalance).toBe(-0.8);
    expect(res.probabilityUp).toBeLessThan(0.5);
    expect(res.microPrice).toBeLessThan(101);
    expect(res.microPrice).toBeGreaterThanOrEqual(100);
    expect(res.driftBps).toBeLessThan(0);
  });

  it('clamps kappa parameter properly within [0, 0.5]', () => {
    const book: StoikovOrderBookL1 = {
      bidPrice: 100,
      askPrice: 101,
      bidVolume: 70,
      askVolume: 30,
    };
    const resK0 = engine.calculate(book, { kappa: 0 });
    const resKHigh = engine.calculate(book, { kappa: 0.5 });
    expect(resKHigh.microPrice).toBeGreaterThan(resK0.microPrice);
  });
});
