// Live Trading Adapter
// Wraps CCXT client with cashclaw-specific safety checks,
// killswitch integration, and error handling.

import { createCCXTClient } from '../ccxt/client';
import { rateLimiter } from '../rate-limiter';
import type {
  ExchangeId,
  Ticker,
  OrderBook,
  Balance,
  OrderRequest,
  OrderResult,
  ExchangeAdapter,
  ExchangeConfig,
} from '../types';
import type { KillswitchCallbacks, LiveExchangeOptions } from './live-exchange-types';
import { executeLiveOrder, cancelLiveOrder, checkKillswitchLoss, pingExchange } from './live-exchange-orders';

export type { KillswitchCallbacks, LiveExchangeOptions } from './live-exchange-types';
export { executeLiveOrder, cancelLiveOrder, checkKillswitchLoss, pingExchange } from './live-exchange-orders';

export class LiveExchange implements ExchangeAdapter {
  id: ExchangeId;
  name: string;
  private client: ReturnType<typeof createCCXTClient>;
  private killswitch: KillswitchCallbacks;
  private dailyPnl: number = 0;
  private maxDailyLoss: number;
  private orderCount: number = 0;
  private maxOrdersPerMinute: number;

  constructor(
    exchangeId: ExchangeId,
    config: ExchangeConfig,
    callbacks: KillswitchCallbacks,
    options: LiveExchangeOptions = {},
  ) {
    this.id = exchangeId;
    this.name = exchangeId;
    this.client = createCCXTClient(exchangeId, {
      apiKey: config.apiKey,
      apiSecret: config.apiSecret,
      sandbox: config.sandbox,
    });
    this.killswitch = callbacks;
    this.maxDailyLoss = (options.maxDailyLossPct ?? 10) / 100;
    this.maxOrdersPerMinute = options.maxOrdersPerMinute ?? 50;
  }

  async fetchTicker(symbol: string): Promise<Ticker> {
    await rateLimiter.acquire(this.id, 'api');
    return this.client.fetchTicker(this.id, symbol) as Promise<Ticker>;
  }

  async fetchOrderBook(symbol: string, depth = 20): Promise<OrderBook> {
    await rateLimiter.acquire(this.id, 'api');
    return this.client.fetchOrderBook(this.id, symbol, depth) as Promise<OrderBook>;
  }

  async fetchBalances(): Promise<Balance[]> {
    await rateLimiter.acquire(this.id, 'api');
    return this.client.fetchBalances(this.id) as Promise<Balance[]>;
  }

  async placeOrder(request: OrderRequest): Promise<OrderResult> {
    const { result, newOrderCount } = await executeLiveOrder(
      {
        id: this.id,
        client: this.client,
        killswitch: this.killswitch,
        dailyPnl: this.dailyPnl,
        maxDailyLoss: this.maxDailyLoss,
        orderCount: this.orderCount,
        maxOrdersPerMinute: this.maxOrdersPerMinute,
      },
      request,
    );
    this.orderCount = newOrderCount;
    return result;
  }

  async cancelOrder(orderId: string, symbol: string): Promise<boolean> {
    return cancelLiveOrder(
      { id: this.id, client: this.client, killswitch: this.killswitch },
      orderId,
      symbol,
    );
  }

  async fetchOrder(orderId: string, symbol: string): Promise<OrderResult> {
    await rateLimiter.acquire(this.id, 'api');
    return this.client.fetchOrder(this.id, orderId, symbol) as Promise<OrderResult>;
  }

  async fetchOpenOrders(symbol?: string): Promise<OrderResult[]> {
    await rateLimiter.acquire(this.id, 'api');
    return this.client.fetchOpenOrders(this.id, symbol) as Promise<OrderResult[]>;
  }

  async ping(): Promise<boolean> {
    return pingExchange(this.id, this.client);
  }

  async getServerTime(): Promise<number> {
    await rateLimiter.acquire(this.id, 'api');
    return Date.now();
  }

  updateDailyPnl(pnl: number): void {
    this.dailyPnl += pnl;
    checkKillswitchLoss(this.dailyPnl, this.maxDailyLoss, this.killswitch);
  }

  tick(): void {
    this.orderCount = 0;
  }
}
