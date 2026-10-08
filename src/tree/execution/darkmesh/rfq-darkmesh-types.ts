// RFQ Dark Mesh & Fair-Share Liquidity Aggregator Types
// P2P crossing network with pro-rata fair-share allocation and zero taker fees.

export type RfqSide = 'BUY' | 'SELL';

export interface RfqQuoteRequest {
  /** Unique RFQ identifier */
  rfqId: string;
  /** Submitting bot or strategy identifier */
  botId: string;
  /** Asset trading pair symbol */
  symbol: string;
  /** Order side: BUY or SELL */
  side: RfqSide;
  /** Requested order volume quantity */
  requestedQuantity: number;
  /** Limit price constraint (optional) */
  limitPrice?: number;
  /** Maximum acceptable slippage tolerance in basis points */
  maxSlippageBps?: number;
  /** Submission epoch timestamp */
  timestamp?: number;
}

export interface RfqMatchFill {
  /** Unique match identifier */
  matchId: string;
  /** Trading symbol */
  symbol: string;
  /** Buy RFQ reference */
  buyRfqId: string;
  /** Sell RFQ reference */
  sellRfqId: string;
  /** Buyer bot identifier */
  buyBotId: string;
  /** Seller bot identifier */
  sellBotId: string;
  /** Matched fill quantity */
  matchedQuantity: number;
  /** Reference settlement mid-price */
  settlementPrice: number;
  /** Total notional value (matchedQuantity * settlementPrice) */
  notionalValue: number;
  /** Estimated fee savings in USD compared to external exchange taker fee */
  feeSavedUsd: number;
  /** Execution timestamp */
  timestamp: number;
}

export interface RfqMeshBatchResult {
  symbol: string;
  settlementPrice: number;
  totalRequestedBuyQuantity: number;
  totalRequestedSellQuantity: number;
  totalMatchedQuantity: number;
  totalMatchedNotional: number;
  totalFeeSavedUsd: number;
  fills: RfqMatchFill[];
  unfilledRequests: RfqQuoteRequest[];
}
