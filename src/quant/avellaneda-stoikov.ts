import type { MarketParameters, InventoryState, AvellanedaStoikovOutput } from "../models/inventory-risk";

/**
 * Core mathematical engine for Avellaneda-Stoikov inventory-based market making.
 */
export class AvellanedaStoikovEngine {
  /**
   * Calculate reservation price and optimal spread based on AS model.
   * 
   * @param market - Market state parameters (S, sigma, k, A)
   * @param inventory - Inventory parameters (q, gamma, T, t)
   * @returns AS pricing output including indifference price and quotes
   */
  public calculateQuotes(market: MarketParameters, inventory: InventoryState): AvellanedaStoikovOutput {
    const timeRemaining = Math.max(0, inventory.terminalTime - inventory.currentTime);
    
    // Indifference price (reservation price):
    // r(s, t) = s - q * gamma * sigma^2 * (T - t)
    const riskDiscount = inventory.currentPosition * inventory.riskAversion * Math.pow(market.volatility, 2) * timeRemaining;
    const reservationPrice = market.midPrice - riskDiscount;

    // Optimal spread calculation:
    // spread = gamma * sigma^2 * (T - t) + (2 / gamma) * ln(1 + (gamma / k))
    
    const timeRiskPremia = inventory.riskAversion * Math.pow(market.volatility, 2) * timeRemaining;
    const executionPremia = (2 / inventory.riskAversion) * Math.log(1 + (inventory.riskAversion / market.executionOrderDensity));
    
    const optimalSpread = timeRiskPremia + executionPremia;

    // We make it symmetric around reservation price for the final quotes
    const halfSpread = optimalSpread / 2;
    const optimalBid = reservationPrice - halfSpread;
    const optimalAsk = reservationPrice + halfSpread;

    return {
      reservationPrice,
      optimalSpread,
      optimalBid,
      optimalAsk,
    };
  }
}
