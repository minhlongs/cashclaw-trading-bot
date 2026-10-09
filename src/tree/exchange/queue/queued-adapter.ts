import type { ExchangeAdapter, ExchangeId, Ticker, OrderBook, Balance, OrderRequest, OrderResult } from '../types';
import type { RequestQueue } from './request-queue';
import { RequestPriority } from './types';
import { getCostForMethod } from './queued-adapter-cost';
import { enqueueAndWaitExchange } from './queued-adapter-enqueue';
import { fetchMarketTicker, fetchMarketOrderBook, fetchMarketBalances } from './queued-adapter-market';

export interface QueuedAdapterDeps { inner: ExchangeAdapter; queue: RequestQueue; getNow?: () => number; }

export class QueuedExchangeAdapter implements ExchangeAdapter {
  readonly id: ExchangeId; readonly name: string;
  private inner: ExchangeAdapter; private queue: RequestQueue; private getNow: () => number;

  constructor(deps: QueuedAdapterDeps) {
    this.inner = deps.inner; this.queue = deps.queue;
    this.getNow = deps.getNow ?? (() => Date.now());
    this.id = this.inner.id; this.name = this.inner.name;
  }

  fetchTicker(s: string): Promise<Ticker> { return fetchMarketTicker(this.inner, s, this.getNow, (t) => this.recordCost('fetchTicker', t)); }
  fetchOrderBook(s: string, d?: number): Promise<OrderBook> { return fetchMarketOrderBook(this.inner, s, d, this.getNow, (t) => this.recordCost('fetchOrderBook', t)); }
  fetchBalances(): Promise<Balance[]> { return fetchMarketBalances(this.inner, this.getNow, (t) => this.recordCost('fetchBalances', t)); }
  placeOrder(r: OrderRequest): Promise<OrderResult> { return this.enqueueAndWait('placeOrder', RequestPriority.LIVE_TRADE, () => this.inner.placeOrder(r)); }
  cancelOrder(id: string, s: string): Promise<boolean> { return this.enqueueAndWait('cancelOrder', RequestPriority.LIVE_TRADE, () => this.inner.cancelOrder(id, s)); }
  fetchOrder(id: string, s: string): Promise<OrderResult> { return this.enqueueAndWait('fetchOrder', RequestPriority.STRATEGY_EVAL, () => this.inner.fetchOrder(id, s)); }
  fetchOpenOrders(s?: string): Promise<OrderResult[]> { return this.enqueueAndWait('fetchOpenOrders', RequestPriority.STRATEGY_EVAL, () => this.inner.fetchOpenOrders(s)); }
  ping(): Promise<boolean> { return this.inner.ping(); }
  getServerTime(): Promise<number> { return this.inner.getServerTime(); }

  async drainQueue(): Promise<{ processed: number; skipped: number; pending: number }> {
    const res = await this.queue.drain(this.id, async (item) => {
      try { await item.execute(); return true; } catch { return false; }
    });
    return { processed: res.processed, skipped: res.skipped, pending: res.pending };
  }

  private enqueueAndWait<T>(m: string, p: RequestPriority, fn: () => Promise<T>): Promise<T> {
    return enqueueAndWaitExchange({ queue: this.queue, exchange: this.id, getNow: this.getNow }, m, p, fn);
  }
  private recordCost(m: string, _s: number): void { this.queue.recordCost(this.id, getCostForMethod(m)); }
}
