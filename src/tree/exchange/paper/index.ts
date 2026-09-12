// Paper Trading Adapter
// Simulates live exchange behavior using local state — no real money.
// Uses real market data for pricing, but simulated order execution.

import type {
  ExchangeId,
  Ticker,
  OrderBook,
  Balance,
  OrderRequest,
  OrderResult,
  OrderStatus,
  Side,
  OrderType,
} from '../types';
import { rateLimiter } from '../rate-limiter';

export type MarketDataFetcher = (exchangeId: ExchangeId, symbol: string) => Promise<Ticker>;

export interface PaperExchangeOptions {
  tickerFetcher?: MarketDataFetcher;
}

export interface PaperTrade {
  orderId: string;
  exchangeId: ExchangeId;
  symbol: string;
  side: Side;
  type: OrderType;
  price: number;
  quantity: number;
  filled: number;
  status: OrderStatus;
  fee: number;
  timestamp: number;
}

export class PaperExchange {
  id: string = 'paper';
  name: string = 'Paper Trading';

  private balances = new Map<string, { free: number; used: number }>();
  orders = new Map<string, PaperTrade>();
  private orderCounter = 0;
  private tickerFetcher?: MarketDataFetcher;

  constructor(
    initialBalances: { currency: string; total: number }[],
    options?: PaperExchangeOptions
  ) {
    for (const b of initialBalances) {
      this.balances.set(b.currency, { free: b.total, used: 0 });
    }
    this.tickerFetcher = options?.tickerFetcher;
  }

  setTickerFetcher(fetcher?: MarketDataFetcher): void {
    this.tickerFetcher = fetcher;
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
    const orderId = `paper_${++this.orderCounter}_${Date.now()}`;
    const trade: PaperTrade = {
      orderId,
      exchangeId,
      symbol: request.symbol,
      side: request.side,
      type: request.type,
      price: request.price ?? 0,
      quantity: request.quantity,
      filled: request.type === 'market' ? request.quantity : 0,
      status: request.type === 'market' ? 'filled' : 'open',
      fee: request.quantity * 0.001, // 0.1% simulated fee
      timestamp: Date.now(),
    };
    this.orders.set(orderId, trade);
    return this.toOrderResult(trade);
  }

  getOrders(): Map<string, PaperTrade> { return this.orders; }
  getOrder(orderId: string): PaperTrade | undefined { return this.orders.get(orderId); }
  toOrderResultPublic(trade: PaperTrade): OrderResult { return this.toOrderResult(trade); }

  async cancelOrder(orderId: string, _symbol: string): Promise<boolean> {
    const trade = this.orders.get(orderId);
    if (!trade || trade.status !== 'open') return false;
    trade.status = 'cancelled';
    this.orders.set(orderId, trade);

    const quoteCurrency = trade.symbol.includes('/') ? trade.symbol.split('/')[1] : 'USDT';
    const bal = this.balances.get(quoteCurrency);
    if (bal) {
      bal.used -= trade.quantity;
      bal.free += trade.quantity;
    }
    return true;
  }

  async fetchOrder(orderId: string, _symbol: string): Promise<OrderResult> {
    const trade = this.orders.get(orderId);
    if (!trade) throw new Error(`Order not found: ${orderId}`);
    return this.toOrderResult(trade);
  }

  async ping(): Promise<boolean> { return true; }
  async getServerTime(): Promise<number> { return Date.now(); }

  async fetchOpenOrders(_symbol?: string): Promise<OrderResult[]> {
    return Array.from(this.orders.values())
      .filter((t) => t.status === 'open')
      .map((t) => this.toOrderResult(t));
  }

  fillOrder(orderId: string, fillPrice: number, fillQty: number): boolean {
    const trade = this.orders.get(orderId);
    if (!trade || trade.status !== 'open') return false;
    trade.filled += fillQty;
    trade.price = fillPrice;
    trade.status = trade.filled >= trade.quantity ? 'filled' : 'partially_filled';
    this.orders.set(orderId, trade);
    return true;
  }

  toOrderResult(trade: PaperTrade): OrderResult {
    return {
      id: trade.orderId,
      exchangeId: trade.exchangeId,
      symbol: trade.symbol,
      side: trade.side,
      type: trade.type,
      price: trade.price,
      quantity: trade.quantity,
      filled: trade.filled,
      status: trade.status,
      fee: trade.fee,
      timestamp: trade.timestamp,
    };
  }
}
