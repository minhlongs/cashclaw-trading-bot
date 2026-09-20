// Live Trading Adapter — Types and Callbacks

import type { OrderResult } from '../types';

export interface KillswitchCallbacks {
  isTradingEnabled: () => boolean;
  onOrderPlaced: (order: OrderResult) => void;
  onOrderFilled: (order: OrderResult) => void;
  onError: (error: Error, context: string) => void;
}

export interface LiveExchangeOptions {
  maxDailyLossPct?: number;
  maxOrdersPerMinute?: number;
}
