// Paper Exchange Provider — wraps PaperExchange with health tracking and circuit breaker.
// Paper-mode-only v1; live adapter wrapped in v2.

import type {
  ExchangeId,
  Ticker,
  OrderBook,
  Balance,
  OrderRequest,
  OrderResult,
} from '../types';
import { PaperExchange, type MarketDataFetcher } from '../paper';
import type { ExchangeProvider, PaperProviderConfig, ProviderHealth, ProviderBudget } from './types';
import { CircuitBreaker } from './circuit-breaker';

export class PaperExchangeProvider implements ExchangeProvider {
  readonly id: string;
  private adapter: PaperExchange;
  private config: PaperProviderConfig;
  private health: ProviderHealth;
  private backoffMs = 0;
  private backoffExpiresAt = 0;
  private budget: ProviderBudget;
  private breaker: CircuitBreaker;

  getAdapter(): PaperExchange { return this.adapter; }

  constructor(config: PaperProviderConfig) {
    this.config = config;
    this.id = `provider:${config.exchangeId}:${config.type}`;

    let tickerFetcher: MarketDataFetcher | undefined = config.tickerFetcher;
    if (!tickerFetcher && config.directTickerProvider) {
      const dtp = config.directTickerProvider;
      tickerFetcher = (_exchangeId: ExchangeId, symbol: string) => dtp.fetchTicker(symbol);
    }

    this.adapter = new PaperExchange(config.initialBalances, { tickerFetcher });
    this.health = { score: 100, lastSuccess: Date.now(), failureCount: 0, latencyMs: 0 };
    this.budget = config.tradingLimits ?? { reqPerMin: 100, reqPerHour: 5000 };
    this.breaker = new CircuitBreaker({ cooldownMs: 60_000, halfOpenAfterMs: 30_000 });
  }

  getConfig(): PaperProviderConfig {
    return { ...this.config, initialBalances: [...this.config.initialBalances] };
  }

  getHealth(): ProviderHealth { return { ...this.health }; }
  getBudget(): ProviderBudget { return { ...this.budget }; }

  recordSuccess(latencyMs: number): void {
    this.health.failureCount = 0;
    this.health.lastSuccess = Date.now();
    this.health.latencyMs = this.health.latencyMs === 0
      ? latencyMs
      : 0.3 * latencyMs + 0.7 * this.health.latencyMs;
    this.health.score = Math.min(100, this.health.score + 5);
  }

  recordFailure(): void {
    this.health.failureCount += 1;
    this.health.score = Math.max(0, this.health.score - 15);
    this.backoffMs = Math.min(60_000, this.backoffMs === 0 ? 1_000 : this.backoffMs * 2);
    this.backoffExpiresAt = Date.now() + this.backoffMs;
  }

  isUnhealthy(): boolean {
    const state = this.breaker.getState();
    return state === 'open' || state === 'half_open' || this.health.score < 40;
  }

  getBackoffMs(): number {
    if (this.backoffExpiresAt > Date.now()) {
      return Math.max(0, this.backoffExpiresAt - Date.now());
    }
    this.backoffMs = 0;
    return 0;
  }

  async fetchTicker(exchangeId: ExchangeId, symbol: string): Promise<Ticker> {
    const start = Date.now();
    try {
      const result = await this.breaker.execute(() => this.adapter.fetchTicker(exchangeId, symbol));
      this.recordSuccess(Date.now() - start);
      return result;
    } catch (err) {
      this.recordFailure();
      throw err;
    }
  }

  async fetchOrderBook(exchangeId: ExchangeId, symbol: string, depth = 20): Promise<OrderBook> {
    const start = Date.now();
    try {
      const result = await this.breaker.execute(() => this.adapter.fetchOrderBook(exchangeId, symbol, depth));
      this.recordSuccess(Date.now() - start);
      return result;
    } catch (err) {
      this.recordFailure();
      throw err;
    }
  }

  async fetchBalances(exchangeId: ExchangeId): Promise<Balance[]> {
    const start = Date.now();
    try {
      const result = await this.breaker.execute(() => this.adapter.fetchBalances(exchangeId));
      this.recordSuccess(Date.now() - start);
      return result;
    } catch (err) {
      this.recordFailure();
      throw err;
    }
  }

  async placeOrder(exchangeId: ExchangeId, req: OrderRequest): Promise<OrderResult> {
    const start = Date.now();
    try {
      const result = await this.breaker.execute(() => this.adapter.placeOrder(exchangeId, req));
      this.recordSuccess(Date.now() - start);
      return result;
    } catch (err) {
      this.recordFailure();
      throw err;
    }
  }

  async cancelOrder(exchangeId: ExchangeId, orderId: string, symbol: string): Promise<boolean> {
    const start = Date.now();
    try {
      const result = await this.breaker.execute(() => this.adapter.cancelOrder(orderId, symbol));
      this.recordSuccess(Date.now() - start);
      return result;
    } catch (err) {
      this.recordFailure();
      throw err;
    }
  }

  async fetchOrder(exchangeId: ExchangeId, orderId: string, _symbol: string): Promise<OrderResult> {
    const start = Date.now();
    try {
      const result = await this.breaker.execute(async () => {
        const trade = this.adapter.getOrder(orderId);
        if (!trade) throw new Error(`Order not found: ${orderId}`);
        return this.adapter.toOrderResultPublic(trade);
      });
      this.recordSuccess(Date.now() - start);
      return result;
    } catch (err) {
      this.recordFailure();
      throw err;
    }
  }

  isCircuitOpen(): boolean { return this.breaker.getState() === 'open'; }
  getCircuitBreaker(): CircuitBreaker { return this.breaker; }
}
