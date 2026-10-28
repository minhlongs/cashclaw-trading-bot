// Live Trading Adapter — Types and Callbacks

import type { OrderResult } from '../types';

export interface KillswitchCallbacks {
  isTradingEnabled: () => boolean;
  onOrderPlaced: (order: OrderResult) => void;
  onOrderFilled: (order: OrderResult) => void;
  onError: (error: Error, context: string) => void;
}

export interface LivePreTradeGateResult {
  approved: boolean;
  reason?: string;
}

/**
 * Explicit integration seam for a future live deployment. It must perform
 * per-strategy approval, risk/exposure and freshness checks, durable idempotency,
 * exchange-state reconciliation, and durable audit before returning approved.
 * No implementation is wired in this paper-only release.
 */
export interface LiveExchangeOptions {
  maxDailyLossPct?: number;
  maxOrdersPerMinute?: number;
  liveExecutionEnabled?: boolean;
  preTradeAuthorizeAndAudit?: (request: import('../types').OrderRequest) => Promise<LivePreTradeGateResult>;
}
