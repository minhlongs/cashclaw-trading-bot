// Cost-Aware Request Queue — types
// Priority levels and queue item definitions for exchange request routing.

import type { ExchangeId } from '../types';

/**
 * Request priority — lower number = higher priority.
 * LIVE_TRADE always dequeues first, HISTORICAL can wait.
 */
export enum RequestPriority {
  /** placeOrder, cancelOrder — time-sensitive, revenue-critical */
  LIVE_TRADE = 0,
  /** fetchTicker, fetchOrderBook — strategy decision inputs */
  STRATEGY_EVAL = 1,
  /** Non-critical market snapshots, health checks */
  MARKET_DATA = 2,
  /** Backfill, historical OHLCV — lowest urgency */
  HISTORICAL = 3,
}

/** Priority label for logging and dashboard display */
export const PRIORITY_LABELS: Record<RequestPriority, string> = {
  [RequestPriority.LIVE_TRADE]: 'live_trade',
  [RequestPriority.STRATEGY_EVAL]: 'strategy_eval',
  [RequestPriority.MARKET_DATA]: 'market_data',
  [RequestPriority.HISTORICAL]: 'historical',
};

/** A queued exchange request */
export interface QueueItem<T = unknown> {
  /** Unique ID for dedup and tracking */
  id: string;
  /** Priority level */
  priority: RequestPriority;
  /** Target exchange */
  exchange: ExchangeId;
  /** Estimated API cost units (1 = standard call, 2+ = expensive) */
  cost: number;
  /** Timestamp when enqueued */
  enqueuedAt: number;
  /** The actual async operation to execute */
  execute: () => Promise<T>;
  /** Optional label for logging */
  label?: string;
}

/** Configuration for RequestQueue */
export interface QueueConfig {
  /** Max items in queue per exchange (prevents unbounded growth) */
  maxDepth: Record<ExchangeId, number>;
  /** Daily cost budget per exchange (in cost units) */
  dailyBudget: Record<ExchangeId, number>;
  /** Max items to process per drain cycle per exchange */
  drainBatchSize: number;
}

/** Default config suitable for CF Workers (conservative limits) */
export const DEFAULT_QUEUE_CONFIG: QueueConfig = {
  maxDepth: { binance: 100, bybit: 100, okx: 100 },
  dailyBudget: { binance: 1000, bybit: 1000, okx: 1000 },
  drainBatchSize: 20,
};

/** Result of a drain cycle */
export interface DrainResult {
  /** Number of items successfully processed */
  processed: number;
  /** Number of items skipped (budget exceeded, circuit open, etc.) */
  skipped: number;
  /** Number of items still pending in queue */
  pending: number;
  /** Per-exchange breakdown */
  byExchange: Record<ExchangeId, { processed: number; skipped: number; pending: number }>;
}
