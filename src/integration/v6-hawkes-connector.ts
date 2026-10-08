import { AvellanedaStoikovEngine } from "../quant/avellaneda-stoikov";
import type { MarketParameters, InventoryState, AvellanedaStoikovOutput } from "../models/inventory-risk";

export interface HawkesState {
  /** Real-time flow toxicity from v6 model (0.0 to 1.0+) */
  toxicityIndicator: number;
  /** Base risk aversion before toxicity multiplier */
  baseRiskAversion: number;
}

export class HawkesConnector {
  private readonly asEngine: AvellanedaStoikovEngine;

  constructor() {
    this.asEngine = new AvellanedaStoikovEngine();
  }

  /**
   * Adjusts risk aversion based on Hawkes toxicity and calculates quotes.
   * 
   * @param hawkes - Hawkes process state and base risk settings
   * @param market - Base market parameters
   * @param inventory - Base inventory state (excluding adjusted risk aversion)
   * @returns Adjusted AS pricing outputs
   */
  public calculateAdjustedQuotes(
    hawkes: HawkesState, 
    market: MarketParameters, 
    baseInventory: Omit<InventoryState, "riskAversion">
  ): AvellanedaStoikovOutput {
    // Increase risk aversion exponentially or linearly as toxicity approaches 1.
    // For toxicity > 0.8, penalty spikes hard to widen spreads.
    let riskAdjustmentFactor = 1;
    if (hawkes.toxicityIndicator > 0.8) {
      // Exponentially scale up taking us into a defensive posture
      riskAdjustmentFactor = 1 + Math.exp((hawkes.toxicityIndicator - 0.8) * 10);
    } else {
      riskAdjustmentFactor = 1 + hawkes.toxicityIndicator;
    }

    const adjustedRiskAversion = hawkes.baseRiskAversion * riskAdjustmentFactor;
    
    const activeInventoryState: InventoryState = {
      ...baseInventory,
      riskAversion: adjustedRiskAversion,
    };

    return this.asEngine.calculateQuotes(market, activeInventoryState);
  }
}
