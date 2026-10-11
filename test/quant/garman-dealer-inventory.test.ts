import { describe, it, expect } from 'vitest';
import { computeGarmanDealerInventory } from '@/tree/quantlib/microstructure/garman-dealer-inventory-engine';

describe('Garman (1976) Dealer Inventory Marketmaking Engine', () => {
  it('skews bid and ask prices when dealer accumulates positive inventory', () => {
    const res = computeGarmanDealerInventory({
      initialInventory: 50,
      buyerArrivalRate: 10,
      sellerArrivalRate: 12,
      baseSpread: 2.0,
      inventorySensitivity: 0.02,
      referencePrice: 100,
    });
    expect(res.effectiveSpread).toBeCloseTo(2.0, 4);
    expect(res.askPrice).toBeLessThan(101); // lower ask to attract buyers
    expect(res.bidPrice).toBeLessThan(99); // lower bid to deter sellers
    expect(res.inventoryDrift).toBe(2);
    expect(res.exhaustionProbability).toBeGreaterThanOrEqual(0);
  });
});
