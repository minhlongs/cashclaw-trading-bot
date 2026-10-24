export class OharaOldfieldInventoryEngine {
  public static calculateQuotes(config: OharaOldfieldConfig): OharaOldfieldQuoteResult {
    const { midPrice: P0, inventory: I, inventoryTarget: ITarget, carryingCostRate: k, riskAversion: gamma, assetVariance: v, baselineSpread: S0 } = config;
    if (P0 <= 0 || S0 < 0 || gamma < 0 || v < 0) {
      throw new Error('Invalid O\'Hara-Oldfield parameters');
    }
    const deltaI = I - ITarget;
    const deterministicCost = k * deltaI;
    const stochasticRisk = gamma * v * deltaI;
    const totalInventorySkew = deterministicCost + stochasticRisk;
    const reservationPrice = P0 - totalInventorySkew;
    const halfSpread = S0 / 2;
    return {
      reservationPrice,
      bidPrice: reservationPrice - halfSpread,
      askPrice: reservationPrice + halfSpread,
      inventorySkew: totalInventorySkew,
      holdingRiskPremium: stochasticRisk,
      deterministicCarryingCost: deterministicCost,
    };
  }
}

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
