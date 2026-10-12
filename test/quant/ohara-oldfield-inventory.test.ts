import { describe, it, expect } from 'vitest';
import { OharaOldfieldInventoryEngine } from '../../src/tree/quantlib/microstructure/ohara-oldfield-inventory-engine';

describe('O\'Hara & Oldfield (1986) Microeconomic Dynamic Inventory Engine', () => {
  it('calculates inventory skew and asymmetric reservation quotes', () => {
    const config = {
      midPrice: 100,
      inventory: 10,
      inventoryTarget: 0,
      carryingCostRate: 0.05,
      riskAversion: 0.1,
      assetVariance: 4.0, // sigma^2 = 4
      baselineSpread: 1.0,
    };
    const res = OharaOldfieldInventoryEngine.calculateQuotes(config);
    // deltaI = 10
    // deterministicCost = 0.05 * 10 = 0.5
    // stochasticRisk = 0.1 * 4.0 * 10 = 4.0
    // totalSkew = 4.5
    // reservationPrice = 100 - 4.5 = 95.5
    // bid = 95.5 - 0.5 = 95.0, ask = 95.5 + 0.5 = 96.0
    expect(res.deterministicCarryingCost).toBeCloseTo(0.5, 4);
    expect(res.holdingRiskPremium).toBeCloseTo(4.0, 4);
    expect(res.inventorySkew).toBeCloseTo(4.5, 4);
    expect(res.reservationPrice).toBeCloseTo(95.5, 4);
    expect(res.bidPrice).toBeCloseTo(95.0, 4);
    expect(res.askPrice).toBeCloseTo(96.0, 4);
  });

  it('throws error on invalid parameter inputs', () => {
    expect(() => {
      OharaOldfieldInventoryEngine.calculateQuotes({
        midPrice: -10,
        inventory: 0,
        inventoryTarget: 0,
        carryingCostRate: 0.1,
        riskAversion: 0.1,
        assetVariance: 1,
        baselineSpread: 1,
      });
    }).toThrow('Invalid O\'Hara-Oldfield parameters');
  });
});
