/**
 * Interfaces and definitions for Inventory Risk and Market Parameters.
 */

export interface MarketParameters {
  /** Mid price of the asset */
  midPrice: number;
  /** Volatility of the asset (sigma) */
  volatility: number;
  /** Probability of execution function parameter (k) */
  executionOrderDensity: number;
  /** Liquidity parameter factor (A) */
  liquidityFactor: number;
}

export interface InventoryState {
  /** Current inventory position (q) */
  currentPosition: number;
  /** Risk aversion parameter (gamma) */
  riskAversion: number;
  /** Terminal time (T) */
  terminalTime: number;
  /** Current time (t) */
  currentTime: number;
}

export interface AvellanedaStoikovOutput {
  /** The calculated reservation price (indifference price) */
  reservationPrice: number;
  /** The optimal spread to capture around reservation price */
  optimalSpread: number;
  /** Optimal Bid Price */
  optimalBid: number;
  /** Optimal Ask Price */
  optimalAsk: number;
}
