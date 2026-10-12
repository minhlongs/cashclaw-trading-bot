/**
 * O'Hara & Oldfield (1986) Microeconomic Dynamic Inventory Types
 * Reference: Maureen O'Hara & George S. Oldfield (1986), JFQA
 */

export interface OharaOldfieldConfig {
  midPrice: number;
  inventory: number;
  inventoryTarget: number;
  carryingCostRate: number; // k (financing / storage / borrow cost)
  riskAversion: number; // gamma
  assetVariance: number; // sigma^2
  baselineSpread: number; // S_0
}

export interface OharaOldfieldQuoteResult {
  reservationPrice: number;
  bidPrice: number;
  askPrice: number;
  inventorySkew: number;
  holdingRiskPremium: number;
  deterministicCarryingCost: number;
}
