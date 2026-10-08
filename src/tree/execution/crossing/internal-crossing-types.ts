// Internal Crossing Network Types
// Pure TypeScript types for dark pool netting and fee-free peer-to-peer execution.

export type OrderSide = 'BUY' | 'SELL';

export interface InternalOrder {
  readonly orderId: string;
  readonly botId: string;
  readonly symbol: string;
  readonly side: OrderSide;
  readonly quantity: number;
  readonly limitPrice?: number;
  readonly timestamp: number;
}

export interface InternalFill {
  readonly matchId: string;
  readonly symbol: string;
  readonly buyOrderId: string;
  readonly sellOrderId: string;
  readonly buyBotId: string;
  readonly sellBotId: string;
  readonly matchedQuantity: number;
  readonly executionPrice: number;
  readonly notionalValue: number;
  readonly feeSavedUsd: number;
  readonly timestamp: number;
}

export interface CrossingBatchResult {
  readonly symbol: string;
  readonly executionPrice: number;
  readonly totalCrossedQuantity: number;
  readonly totalCrossedNotional: number;
  readonly totalFeeSavingsUsd: number;
  readonly fills: readonly InternalFill[];
  readonly unmatchedOrders: readonly InternalOrder[];
}
