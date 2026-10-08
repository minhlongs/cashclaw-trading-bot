// Multi-Venue Perpetual Funding Rate Basis Arbitrage Types

export interface VenueFundingQuote {
  /** Identifier of the exchange venue (e.g., 'binance', 'okx', 'bybit', 'deribit') */
  venueId: string;
  /** Trading pair symbol (e.g., 'BTC-USDT') */
  symbol: string;
  /** Funding rate for the period (e.g., 0.0001 for +0.01%) */
  fundingRate: number;
  /** Funding interval in hours (e.g., 8 for 8-hour, 1 for 1-hour) */
  fundingIntervalHours: number;
  /** Current mark/mid price on the venue */
  markPrice: number;
  /** Taker fee rate (e.g., 0.0004 for 4 bps) */
  takerFeeRate: number;
  /** Optional estimated liquidation price */
  liquidationPrice?: number;
}

export type BasisArbitrageStatus = 'EXECUTE' | 'HOLD' | 'UNWIND' | 'REJECT';

export interface FundingBasisOpportunity {
  /** Venue to open SHORT perpetual (receiving funding) */
  shortVenueId: string;
  /** Venue to open LONG perpetual (paying lower or negative funding) */
  longVenueId: string;
  /** Trading symbol */
  symbol: string;
  /** Annualized gross funding rate differential */
  grossAnnualYield: number;
  /** Annualized net yield after amortized taker fees and borrow drag */
  netAnnualYield: number;
  /** Planned investment holding period in days */
  holdingDays: number;
  /** Amortized annual taker fee drag */
  takerFeeAnnualDrag: number;
  /** Annual borrow rate cost */
  annualBorrowCost: number;
  /** Normalized liquidation distance safety metric [0, 1] */
  minLiquidationDistance: number;
  /** Decision recommendation */
  status: BasisArbitrageStatus;
  /** Configured minimum hurdle APR */
  hurdleRateAnnual: number;
}

export interface FundingBasisConfig {
  /** Minimum annual net yield required to execute (default: 0.08 = 8%) */
  minHurdleRateAnnual?: number;
  /** Minimum buffer distance to liquidation required (default: 0.20 = 20%) */
  minLiquidationDistance?: number;
  /** Target holding horizon in days for fee amortization (default: 30) */
  defaultHoldingDays?: number;
  /** Estimated cost of borrow/margin capital annualized (default: 0.02 = 2%) */
  annualBorrowRate?: number;
  /** Default leverage if liquidation price is not provided (default: 3) */
  defaultLeverage?: number;
  /** Maintenance margin requirement ratio (default: 0.05 = 5%) */
  maintenanceMarginRatio?: number;
}
