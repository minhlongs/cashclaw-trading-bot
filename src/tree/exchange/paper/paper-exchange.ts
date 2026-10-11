import type { ExchangeId, Ticker, OrderBook, Balance, OrderRequest, OrderResult } from '../types';
import { rateLimiter } from '../rate-limiter';
import type { MarketDataFetcher, PaperExchangeOptions, PaperTrade } from './paper-types';
import { mapTradeToOrderResult } from './paper-order-helpers';
import { placeOrder, cancelOrder, fetchOrder, fetchOpenOrders, fillOrder } from './paper-order-execution';
import { fetchPaperTicker, fetchPaperOrderBook, fetchPaperBalances } from './paper-market-data';

export class PaperExchange {
  id = 'paper'; name = 'Paper Trading';
  private balances = new Map<string, { free: number; used: number }>();
  orders = new Map<string, PaperTrade>();
  private orderCounter = 0; private tickerFetcher?: MarketDataFetcher;
  constructor(initialBalances: { currency: string; total: number }[], options?: PaperExchangeOptions) {
    for (const b of initialBalances) this.balances.set(b.currency, { free: b.total, used: 0 });
    this.tickerFetcher = options?.tickerFetcher;
  }
  setTickerFetcher(fetcher?: MarketDataFetcher): void { this.tickerFetcher = fetcher; }
  private getState() { return { orders: this.orders, orderCounter: this.orderCounter, balances: this.balances }; }
  async fetchTicker(ex: ExchangeId, sym: string): Promise<Ticker> { return fetchPaperTicker(ex, sym, this.tickerFetcher); }
  async fetchOrderBook(ex: ExchangeId, sym: string, d = 20): Promise<OrderBook> { return fetchPaperOrderBook(ex, sym, d); }
  async fetchBalances(ex: ExchangeId): Promise<Balance[]> { return fetchPaperBalances(ex, this.balances); }
  async placeOrder(ex: ExchangeId, req: OrderRequest): Promise<OrderResult> {
    await rateLimiter.acquire(ex, 'order');
    const s = this.getState(), res = placeOrder(s, ex, req);
    this.orderCounter = s.orderCounter; return res;
  }
  getOrders(): Map<string, PaperTrade> { return this.orders; } getOrder(id: string): PaperTrade | undefined { return this.orders.get(id); }
  toOrderResultPublic(trade: PaperTrade): OrderResult { return this.toOrderResult(trade); }
  async cancelOrder(id: string, _s: string): Promise<boolean> { return cancelOrder(this.getState(), id); }
  async fetchOrder(id: string, _s: string): Promise<OrderResult> { return fetchOrder(this.getState(), id); }
  async ping(): Promise<boolean> { return true; } async getServerTime(): Promise<number> { return Date.now(); }
  async fetchOpenOrders(_s?: string): Promise<OrderResult[]> { return fetchOpenOrders(this.getState()); }
  fillOrder(id: string, p: number, q: number): boolean { return fillOrder(this.getState(), id, p, q); }
  toOrderResult(trade: PaperTrade): OrderResult { return mapTradeToOrderResult(trade); }
}
