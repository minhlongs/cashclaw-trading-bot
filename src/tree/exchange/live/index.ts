// Live Trading Adapter
// Wraps CCXT client with cashclaw-specific safety checks,
// killswitch integration, and error handling.

import { createCCXTClient } from '../ccxt/client';
import { rateLimiter } from '../rate-limiter';
import { createLogger } from '@/lib/logger';

const log = createLogger({ module: 'exchange-live' });
import type {
  ExchangeId,
  Ticker,
  OrderBook,
  Balance,
  OrderRequest,
  OrderResult,
  ExchangeAdapter,
  ExchangeConfig,
  Side,
  OrderType,
  OrderStatus,
} from '../types';

interface KillswitchCallbacks {
  isTradingEnabled: () => boolean;
  onOrderPlaced: (order: OrderResult) => void;
  onOrderFilled: (order: OrderResult) => void;
  onError: (error: Error, context: string) => void;
}

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
    options: { maxDailyLossPct?: number; maxOrdersPerMinute?: number } = {},
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
    if (!this.killswitch.isTradingEnabled()) {
      throw new Error('Trading halted by killswitch');
    }

    if (Math.abs(this.dailyPnl) >= this.maxDailyLoss) {
      throw new Error(`Daily loss limit reached: ${(this.dailyPnl * 100).toFixed(2)}%`);
    }

    if (this.orderCount >= this.maxOrdersPerMinute) {
      throw new Error(`Rate limit: ${this.maxOrdersPerMinute} orders/minute`);
    }

    await rateLimiter.acquire(this.id, 'order');

    try {
      const result = await this.client.placeOrder(this.id, request as any);
      this.orderCount++;
      this.killswitch.onOrderPlaced(result as OrderResult);
      return result as OrderResult;
    } catch (error) {
      this.killswitch.onError(error instanceof Error ? error : new Error(String(error)), 'placeOrder');
      throw error;
    }
  }

  async cancelOrder(orderId: string, symbol: string): Promise<boolean> {
    await rateLimiter.acquire(this.id, 'order');
    try {
      return await this.client.cancelOrder(this.id, orderId, symbol);
    } catch (error) {
      this.killswitch.onError(error instanceof Error ? error : new Error(String(error)), 'cancelOrder');
      return false;
    }
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
    try {
      await rateLimiter.acquire(this.id, 'api');
      await this.client.fetchTicker(this.id, 'BTC/USDT');
      return true;
    } catch (error) {
      log.warn('Exchange ping failed', { action: 'ping', error: error instanceof Error ? error : new Error(String(error)) });
      return false;
    }
  }

  async getServerTime(): Promise<number> {
    await rateLimiter.acquire(this.id, 'api');
    return Date.now();
  }

  /**
   * Track realized P&L for killswitch loss limits.
   */
  updateDailyPnl(pnl: number): void {
    this.dailyPnl += pnl;
    if (Math.abs(this.dailyPnl) >= this.maxDailyLoss) {
      this.killswitch.onError(
        new Error(`Daily loss limit breached: ${(this.dailyPnl * 100).toFixed(2)}%`),
        'dailyLossCheck',
      );
    }
  }

  /**
   * Reset per-minute order counter (call from cron).
   */
  tick(): void {
    this.orderCount = 0;
  }
}
