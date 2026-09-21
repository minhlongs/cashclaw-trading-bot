import type {
  ExchangeId,
  Ticker,
  OrderBook,
  Balance,
  OrderRequest,
  OrderResult,
} from '../types';
import { rateLimiter } from '../rate-limiter';
import type { MarketDataFetcher, PaperExchangeOptions, PaperTrade } from './paper-types';
import { mapTradeToOrderResult } from './paper-order-helpers';
import {
  placeOrder,
  cancelOrder,
  fetchOrder,
  fetchOpenOrders,
  fillOrder,
} from './paper-order-execution';

export class PaperExchange {
  id: string = 'paper';
  name: string = 'Paper Trading';

  private balances = new Map<string, { free: number; used: number }>();
  orders = new Map<string, PaperTrade>();
  private orderCounter = 0;
  private tickerFetcher?: MarketDataFetcher;

  constructor(
    initialBalances: { currency: string; total: number }[],
    options?: PaperExchangeOptions,
  ) {
    for (const b of initialBalances) {
      this.balances.set(b.currency, { free: b.total, used: 0 });
    }
    this.tickerFetcher = options?.tickerFetcher;
  }

  setTickerFetcher(fetcher?: MarketDataFetcher): void {
    this.tickerFetcher = fetcher;
  }

  private getState() {
    return { orders: this.orders, orderCounter: this.orderCounter, balances: this.balances };
  }

  // Simulate market data — if tickerFetcher is supplied, fetch live market pricing
  async fetchTicker(exchangeId: ExchangeId, symbol: string): Promise<Ticker> {
    await rateLimiter.acquire(exchangeId, 'api');
    if (this.tickerFetcher) {
      try {
        return await this.tickerFetcher(exchangeId, symbol);
      } catch {
        // Fall back gracefully to simulated zero ticker on fetcher failure
      }
    }
    return {
      symbol,
      last: 0,
      bid: 0,
      ask: 0,
      high24h: 0,
      low24h: 0,
      volume24h: 0,
      timestamp: Date.now(),
    };
  }

  async fetchOrderBook(exchangeId: ExchangeId, symbol: string, _depth = 20): Promise<OrderBook> {
    await rateLimiter.acquire(exchangeId, 'api');
    return { symbol, bids: [], asks: [], timestamp: Date.now() };
  }

  async fetchBalances(exchangeId: ExchangeId): Promise<Balance[]> {
    await rateLimiter.acquire(exchangeId, 'api');
    return Array.from(this.balances.entries()).map(([currency, { free, used }]) => ({
      currency,
      free,
      used,
      total: free + used,
    }));
  }

  async placeOrder(exchangeId: ExchangeId, request: OrderRequest): Promise<OrderResult> {
    await rateLimiter.acquire(exchangeId, 'order');
    const state = this.getState();
    const result = placeOrder(state, exchangeId, request);
    this.orderCounter = state.orderCounter;
    return result;
  }

  getOrders(): Map<string, PaperTrade> { return this.orders; }
  getOrder(orderId: string): PaperTrade | undefined { return this.orders.get(orderId); }
  toOrderResultPublic(trade: PaperTrade): OrderResult { return this.toOrderResult(trade); }

  async cancelOrder(orderId: string, _symbol: string): Promise<boolean> {
    return cancelOrder(this.getState(), orderId);
  }

  async fetchOrder(orderId: string, _symbol: string): Promise<OrderResult> {
    return fetchOrder(this.getState(), orderId);
  }

  async ping(): Promise<boolean> { return true; }
  async getServerTime(): Promise<number> { return Date.now(); }

  async fetchOpenOrders(_symbol?: string): Promise<OrderResult[]> {
    return fetchOpenOrders(this.getState());
  }

  fillOrder(orderId: string, fillPrice: number, fillQty: number): boolean {
    return fillOrder(this.getState(), orderId, fillPrice, fillQty);
  }

  toOrderResult(trade: PaperTrade): OrderResult {
    return mapTradeToOrderResult(trade);
  }
}
