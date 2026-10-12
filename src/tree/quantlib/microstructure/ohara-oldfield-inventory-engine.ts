import {
  OharaOldfieldConfig,
  OharaOldfieldQuoteResult,
} from './ohara-oldfield-inventory-types';

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
