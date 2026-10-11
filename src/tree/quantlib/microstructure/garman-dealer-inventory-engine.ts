import type { GarmanDealerInventoryParams, GarmanDealerInventoryResult } from './garman-dealer-inventory-types';

export function computeGarmanDealerInventory(p: GarmanDealerInventoryParams): GarmanDealerInventoryResult {
  const i0 = p.initialInventory, p0 = Math.max(1e-4, p.referencePrice);
  const lb = Math.max(0, p.buyerArrivalRate), ls = Math.max(0, p.sellerArrivalRate);
  const halfSpread = Math.max(1e-4, p.baseSpread) / 2, gamma = Math.max(0, p.inventorySensitivity);
  const skew = gamma * i0;
  const ask = Math.max(1e-4, p0 + halfSpread - skew);
  const bid = Math.max(1e-4, p0 - halfSpread - skew);
  const drift = ls - lb, variance = Math.max(1e-6, ls + lb);
  const exhaustionProb = drift < 0 && i0 > 0 ? Math.min(1, Math.exp((2 * drift * i0) / variance)) : drift > 0 && i0 < 0 ? Math.min(1, Math.exp((2 * drift * i0) / variance)) : 1;
  return {
    askPrice: ask,
    bidPrice: bid,
    effectiveSpread: ask - bid,
    inventoryDrift: drift,
    inventoryVariance: variance,
    exhaustionProbability: Math.max(0, Math.min(1, exhaustionProb)),
  };
}
