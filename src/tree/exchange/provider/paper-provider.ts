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
import { PaperExchange } from '../paper';
import type { ExchangeProvider, PaperProviderConfig, ProviderHealth, ProviderBudget } from './types';
import { CircuitBreaker } from './circuit-breaker';

export class PaperExchangeProvider implements ExchangeProvider {
  readonly id: string;

  private adapter: PaperExchange;
  private config: PaperProviderConfig;

  // Health state
  private health: ProviderHealth;
  private backoffMs = 0;
  private backoffExpiresAt = 0;

  // Budget from config
  private budget: ProviderBudget;

  // Circuit breaker per provider (configurable via config or defaults)
  private breaker: CircuitBreaker;

  // Expose adapter for circuit breaker wrapping
  getAdapter(): PaperExchange {
    return this.adapter;
  }

  constructor(config: PaperProviderConfig) {
    this.config = config;
    this.id = `provider:${config.exchangeId}:${config.type}`;
    this.adapter = new PaperExchange(config.initialBalances);

    this.health = {
      score: 100,
      lastSuccess: Date.now(),
      failureCount: 0,
      latencyMs: 0,
    };

    // Default budget from config.tradingLimits if provided
    this.budget = config.tradingLimits ?? {
      reqPerMin: 100,
      reqPerHour: 5000,
    };

    // Default circuit breaker config; can be overridden in future via ProviderConfig
    this.breaker = new CircuitBreaker({
      cooldownMs: 60_000,     // 1 minute cooldown after tripping
      halfOpenAfterMs: 30_000, // try half-open after 30s
    });
  }

  getConfig(): PaperProviderConfig {
    // Return a shallow copy so callers can't mutate internal state
    return { ...this.config, initialBalances: [...this.config.initialBalances] };
  }

  getHealth(): ProviderHealth {
    // Score is managed directly by recordSuccess/recordFailure — no dynamic recomputation
    return { ...this.health };
  }

  getBudget(): ProviderBudget {
    return { ...this.budget };
  }

  /** Record a successful call — reset failure count, update rolling avg latency */
  recordSuccess(latencyMs: number): void {
    this.health.failureCount = 0;
    this.health.lastSuccess = Date.now();

    // Exponential moving average for latency (smoothing factor 0.3)
    if (this.health.latencyMs === 0) {
      this.health.latencyMs = latencyMs;
    } else {
      this.health.latencyMs = 0.3 * latencyMs + 0.7 * this.health.latencyMs;
    }

    // Score recovers on success
    this.health.score = Math.min(100, this.health.score + 5);
  }

  /** Record a failed call — increment failure count, degrade health */
  recordFailure(): void {
    this.health.failureCount += 1;
    this.health.score = Math.max(0, this.health.score - 15);
    this.backoffMs = Math.min(60_000, this.backoffMs === 0 ? 1_000 : this.backoffMs * 2);
    this.backoffExpiresAt = Date.now() + this.backoffMs;
  }

  /** Whether the provider is in a degraded or circuit-open state */
  isUnhealthy(): boolean {
    const state = this.breaker.getState();
    return state === 'open' || state === 'half_open' || this.health.score < 40;
  }

  /** Backoff wait ms if in cooldown, 0 otherwise */
  getBackoffMs(): number {
    if (this.backoffExpiresAt > Date.now()) {
      return Math.max(0, this.backoffExpiresAt - Date.now());
    }
    this.backoffMs = 0;
    return 0;
  }

  // ── Exchange API wrappers (go through circuit breaker) ──────────────────

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

  /** Direct access to circuit breaker for orchestrator visibility */
  isCircuitOpen(): boolean {
    return this.breaker.getState() === 'open';
  }
}
