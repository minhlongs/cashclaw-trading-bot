import { describe, expect, it } from 'vitest';
import { computeHoStollQuotes } from '@/tree/quantlib/microstructure/ho-stoll-engine';

describe('Ho & Stoll (1981) Optimal Dealer Pricing & Inventory Risk Engine', () => {
  it('computes symmetric quotes for flat inventory and skews for long/short inventories', () => {
    const res = computeHoStollQuotes({
      midPrice: 100,
      inventories: [-5, 0, 5],
      riskAversion: 0.1,
      volatility: 0.02,
      timeHorizon: 1.0,
      arrivalIntensity: 1.5,
    });

    expect(res.quotes).toHaveLength(3);
    expect(res.baseSpread).toBeGreaterThan(0);
    expect(res.reservationPriceShiftPerUnit).toBeGreaterThan(0);

    const [shortQ, flatQ, longQ] = res.quotes;

    // Flat inventory
    expect(flatQ.inventory).toBe(0);
    expect(flatQ.reservationPrice).toBeCloseTo(100, 4);
    expect(flatQ.inventorySkew).toBeCloseTo(0, 4);
    expect(flatQ.optimalBid).toBeLessThan(100);
    expect(flatQ.optimalAsk).toBeGreaterThan(100);

    // Short dealer: inventory < 0 -> wants to buy -> reservation price > mid
    expect(shortQ.reservationPrice).toBeGreaterThan(100);
    expect(shortQ.inventorySkew).toBeGreaterThan(0);
    expect(shortQ.optimalBid).toBeGreaterThan(flatQ.optimalBid);
    expect(shortQ.optimalAsk).toBeGreaterThan(flatQ.optimalAsk);

    // Long dealer: inventory > 0 -> wants to sell -> reservation price < mid
    expect(longQ.reservationPrice).toBeLessThan(100);
    expect(longQ.inventorySkew).toBeLessThan(0);
    expect(longQ.optimalBid).toBeLessThan(flatQ.optimalBid);
    expect(longQ.optimalAsk).toBeLessThan(flatQ.optimalAsk);
  });

  it('handles default empty inventories safely', () => {
    const res = computeHoStollQuotes({
      midPrice: 50,
      inventories: [],
    });

    expect(res.quotes).toHaveLength(1);
    expect(res.quotes[0].inventory).toBe(0);
    expect(res.averageSpread).toBe(res.baseSpread);
  });

  it('widens the spread when risk aversion increases', () => {
    const lowRisk = computeHoStollQuotes({ midPrice: 100, inventories: [0], riskAversion: 0.01 });
    const highRisk = computeHoStollQuotes({ midPrice: 100, inventories: [0], riskAversion: 0.5 });

    expect(highRisk.baseSpread).toBeGreaterThan(lowRisk.baseSpread);
  });
});
