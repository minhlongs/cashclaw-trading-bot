// Paper Exchange Provider — wraps PaperExchange with health tracking and circuit breaker.
// Paper-mode-only v1; live adapter wrapped in v2.

import type { ExchangeId, Ticker, OrderBook, Balance, OrderRequest, OrderResult } from '../types';
import { PaperExchange, type MarketDataFetcher } from '../paper';
import type { ExchangeProvider, PaperProviderConfig, ProviderHealth, ProviderBudget } from './types';
import { CircuitBreaker } from './circuit-breaker';
import {
  createInitialHealth,
  applyRecordSuccess,
  applyRecordFailure,
  isScoreUnhealthy,
} from './paper-provider-health';
import { computeNextBackoff, resolveBackoffMs } from './paper-provider-circuit';
import {
  fetchTicker as apiFetchTicker,
  fetchOrderBook as apiFetchOrderBook,
  fetchBalances as apiFetchBalances,
  placeOrder as apiPlaceOrder,
  cancelOrder as apiCancelOrder,
  fetchOrder as apiFetchOrder,
} from './paper-provider-api';

export { createInitialHealth, applyRecordSuccess, applyRecordFailure, isScoreUnhealthy } from './paper-provider-health';
export { computeNextBackoff, resolveBackoffMs } from './paper-provider-circuit';

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
    this.health = createInitialHealth();
    this.budget = config.tradingLimits ?? { reqPerMin: 100, reqPerHour: 5000 };
    this.breaker = new CircuitBreaker({ cooldownMs: 60_000, halfOpenAfterMs: 30_000 });
  }

  getConfig(): PaperProviderConfig {
    return { ...this.config, initialBalances: [...this.config.initialBalances] };
  }

  getHealth(): ProviderHealth { return { ...this.health }; }
  getBudget(): ProviderBudget { return { ...this.budget }; }

  recordSuccess(latencyMs: number): void {
    this.health = applyRecordSuccess(this.health, latencyMs);
  }

  recordFailure(): void {
    this.health = applyRecordFailure(this.health);
    const backoff = computeNextBackoff(this.backoffMs);
    this.backoffMs = backoff.backoffMs;
    this.backoffExpiresAt = backoff.expiresAt;
  }

  isUnhealthy(): boolean {
    const state = this.breaker.getState();
    return state === 'open' || state === 'half_open' || isScoreUnhealthy(this.health.score);
  }

  getBackoffMs(): number {
    const res = resolveBackoffMs(this.backoffMs, this.backoffExpiresAt);
    if (res.expired) this.backoffMs = 0;
    return res.waitMs;
  }

  private get rec() {
    return {
      health: this.health,
      setHealth: (next: ProviderHealth) => { this.health = next; },
      recordFailure: () => this.recordFailure(),
    };
  }

  async fetchTicker(exchangeId: ExchangeId, symbol: string): Promise<Ticker> {
    return apiFetchTicker(this.adapter, this.breaker, exchangeId, symbol, this.rec);
  }
  async fetchOrderBook(exchangeId: ExchangeId, symbol: string, depth = 20): Promise<OrderBook> {
    return apiFetchOrderBook(this.adapter, this.breaker, exchangeId, symbol, depth, this.rec);
  }
  async fetchBalances(exchangeId: ExchangeId): Promise<Balance[]> {
    return apiFetchBalances(this.adapter, this.breaker, exchangeId, this.rec);
  }
  async placeOrder(exchangeId: ExchangeId, req: OrderRequest): Promise<OrderResult> {
    return apiPlaceOrder(this.adapter, this.breaker, exchangeId, req, this.rec);
  }
  async cancelOrder(exchangeId: ExchangeId, orderId: string, symbol: string): Promise<boolean> {
    return apiCancelOrder(this.adapter, this.breaker, orderId, symbol, this.rec);
  }
  async fetchOrder(exchangeId: ExchangeId, orderId: string, _symbol: string): Promise<OrderResult> {
    return apiFetchOrder(this.adapter, this.breaker, orderId, this.rec);
  }

  isCircuitOpen(): boolean { return this.breaker.getState() === 'open'; }
  getCircuitBreaker(): CircuitBreaker { return this.breaker; }
}
