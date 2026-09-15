// Queued Exchange Adapter — wraps ExchangeAdapter with cost-aware priority queue
// Market data calls execute directly. Trading calls route through RequestQueue.

import type { ExchangeAdapter, ExchangeId, Ticker, OrderBook, Balance, OrderRequest, OrderResult } from '../types';
import type { RequestQueue } from './request-queue';
import { RequestPriority } from './types';
import { getCostForMethod } from './queued-adapter-cost';
import { enqueueAndWaitExchange } from './queued-adapter-enqueue';
import { createLogger } from '@/lib/logger';

const log = createLogger('queued-adapter');

export interface QueuedAdapterDeps {
  inner: ExchangeAdapter;
  queue: RequestQueue;
  getNow?: () => number;
}

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
    return this.enqueueAndWait('placeOrder', RequestPriority.LIVE_TRADE, () => this.inner.placeOrder(request));
  }

  async cancelOrder(orderId: string, symbol: string): Promise<boolean> {
    return this.enqueueAndWait('cancelOrder', RequestPriority.LIVE_TRADE, () => this.inner.cancelOrder(orderId, symbol));
  }

  async fetchOrder(orderId: string, symbol: string): Promise<OrderResult> {
    return this.enqueueAndWait('fetchOrder', RequestPriority.STRATEGY_EVAL, () => this.inner.fetchOrder(orderId, symbol));
  }

  async fetchOpenOrders(symbol?: string): Promise<OrderResult[]> {
    return this.enqueueAndWait('fetchOpenOrders', RequestPriority.STRATEGY_EVAL, () => this.inner.fetchOpenOrders(symbol));
  }

  // ── Health — execute directly (zero cost) ──────────────────

  async ping(): Promise<boolean> {
    return this.inner.ping();
  }

  async getServerTime(): Promise<number> {
    return this.inner.getServerTime();
  }

  // ── Queue drain helper ─────────────────────────────────────

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

  private async enqueueAndWait<T>(
    method: string,
    priority: RequestPriority,
    execute: () => Promise<T>,
  ): Promise<T> {
    return enqueueAndWaitExchange(
      { queue: this.queue, exchange: this.id, getNow: this.getNow },
      method,
      priority,
      execute,
    );
  }

  private recordCost(method: string, start: number): void {
    const cost = getCostForMethod(method);
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
