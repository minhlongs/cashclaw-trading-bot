// Queued Exchange Adapter — wraps ExchangeAdapter with cost-aware priority queue
// Market data calls (fetchTicker, fetchOrderBook) execute directly for speed.
// Trading calls (placeOrder, cancelOrder, fetchOpenOrders) route through RequestQueue.
// Cost is tracked per-exchange via CostTracker for budget enforcement.

import type { ExchangeAdapter, ExchangeId, Ticker, OrderBook, Balance, OrderRequest, OrderResult } from '../types';
import type { RequestQueue } from './request-queue';
import { RequestPriority } from './types';
import { createLogger } from '@/lib/logger';

const log = createLogger('queued-adapter');

export interface QueuedAdapterDeps {
  inner: ExchangeAdapter;
  queue: RequestQueue;
  getNow?: () => number;
}

/**
 * Cost estimates per API call type.
 * Standard = 1 unit, expensive = 2+ units.
 */
const COST: Record<string, number> = {
  fetchTicker: 1,
  fetchOrderBook: 1,
  fetchBalances: 1,
  placeOrder: 2,
  cancelOrder: 1,
  fetchOrder: 1,
  fetchOpenOrders: 1,
  ping: 0,   // free
  getServerTime: 0, // free
};

export class QueuedExchangeAdapter implements ExchangeAdapter {
  readonly id: ExchangeId;
  readonly name: string;
  private inner: ExchangeAdapter;
  private queue: RequestQueue;
  private getNow: () => number;

  constructor(deps: QueuedAdapterDeps) {
    this.inner = deps.inner;
    this.queue = deps.queue;
    this.getNow = deps.getNow ?? (() => Date.now());
    this.id = this.inner.id;
    this.name = this.inner.name;
  }

  // ── Market data — execute directly, track cost ──────────────

  async fetchTicker(symbol: string): Promise<Ticker> {
    const start = this.getNow();
    const result = await this.inner.fetchTicker(symbol);
    this.recordCost('fetchTicker', start);
    return result;
  }

  async fetchOrderBook(symbol: string, depth?: number): Promise<OrderBook> {
    const start = this.getNow();
    const result = await this.inner.fetchOrderBook(symbol, depth);
    this.recordCost('fetchOrderBook', start);
    return result;
  }

  async fetchBalances(): Promise<Balance[]> {
    const start = this.getNow();
    const result = await this.inner.fetchBalances();
    this.recordCost('fetchBalances', start);
    return result;
  }

  // ── Trading — route through queue ──────────────────────────

  async placeOrder(request: OrderRequest): Promise<OrderResult> {
    return this.enqueueAndWait(
      'placeOrder',
      RequestPriority.LIVE_TRADE,
      () => this.inner.placeOrder(request),
    );
  }

  async cancelOrder(orderId: string, symbol: string): Promise<boolean> {
    return this.enqueueAndWait(
      'cancelOrder',
      RequestPriority.LIVE_TRADE,
      () => this.inner.cancelOrder(orderId, symbol),
    );
  }

  async fetchOrder(orderId: string, symbol: string): Promise<OrderResult> {
    return this.enqueueAndWait(
      'fetchOrder',
      RequestPriority.STRATEGY_EVAL,
      () => this.inner.fetchOrder(orderId, symbol),
    );
  }

  async fetchOpenOrders(symbol?: string): Promise<OrderResult[]> {
    return this.enqueueAndWait(
      'fetchOpenOrders',
      RequestPriority.STRATEGY_EVAL,
      () => this.inner.fetchOpenOrders(symbol),
    );
  }

  // ── Health — execute directly (zero cost) ──────────────────

  async ping(): Promise<boolean> {
    return this.inner.ping();
  }

  async getServerTime(): Promise<number> {
    return this.inner.getServerTime();
  }

  // ── Queue drain helper ─────────────────────────────────────

  /**
   * Drain the exchange queue — called by Scheduler after tick cycle.
   * Processes enqueued items in priority order.
   */
  async drainQueue(): Promise<{ processed: number; skipped: number; pending: number }> {
    const result = await this.queue.drain(this.id, async (item) => {
      try {
        await item.execute();
        return true;
      } catch {
        return false;
      }
    });
    return {
      processed: result.processed,
      skipped: result.skipped,
      pending: result.pending,
    };
  }

  // ── Internal ───────────────────────────────────────────────

  /**
   * Enqueue a trading call and wait for it to complete.
   * Adds the item to the queue, then immediately processes it.
   * This keeps the adapter interface synchronous while still
   * tracking costs and respecting capacity limits.
   */
  private async enqueueAndWait<T>(
    method: string,
    priority: RequestPriority,
    execute: () => Promise<T>,
  ): Promise<T> {
    const cost = COST[method] ?? 1;
    const label = `${this.id}:${method}`;

    // Enqueue and immediately dequeue — we need the result now
    const id = this.queue.enqueue({
      priority,
      exchange: this.id,
      cost,
      execute,
      label,
    });

    if (!id) {
      // Queue full or budget exceeded — fall back to direct execution
      log.warn('Queue rejected, falling back to direct execution', {
        method,
        exchange: this.id,
      });
      const start = this.getNow();
      try {
        return await execute();
      } finally {
        this.recordCost(method, start);
      }
    }

    // Dequeue the item we just enqueued (it's at the front)
    const item = this.queue.dequeue(this.id);
    if (!item) {
      // Shouldn't happen, but defensive fallback
      const start = this.getNow();
      try {
        return await execute();
      } finally {
        this.recordCost(method, start);
      }
    }

    // Execute and track cost
    const start = this.getNow();
    try {
      return await item.execute() as T;
    } finally {
      this.recordCost(method, start);
    }
  }

  private recordCost(method: string, start: number): void {
    const cost = COST[method] ?? 1;
    const latencyMs = this.getNow() - start;
    this.queue.recordCost(this.id, cost);
    log.debug('API call recorded', {
      exchange: this.id,
      method,
      cost,
      latencyMs,
    });
  }
}
