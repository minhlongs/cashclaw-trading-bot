// ProviderChain: compose primary + optional fallback exchange adapter.
// Uses shared CircuitBreaker to preserve state across chain transitions.
// YAGNI: max 1 fallback; circuit-breaker owns retry/cooldown semantics.

import type { CircuitBreaker, CircuitState } from './circuit-breaker';
import type {
  Ticker,
  OrderRequest,
  OrderResult,
} from '../types';

export interface ProviderResult<T> {
  ok: boolean;
  data?: T;
  error?: string;
  provenance: {
    provider: string;
    latencyMs: number;
    circuitState: CircuitState;
  };
}

export interface Provider {
  name: string;
  circuitBreaker: CircuitBreaker;
  healthCheck(): Promise<boolean>;
}

export interface TickerProvider extends Provider {
  fetchTicker(symbol: string): Promise<ProviderResult<Ticker>>;
}

export interface OrderProvider extends Provider {
  placeOrder(req: OrderRequest): Promise<ProviderResult<OrderResult>>;
}

export class ProviderChain {
  private readonly primary: TickerProvider & OrderProvider;
  private readonly fallback?: TickerProvider & OrderProvider;

  constructor(opts: {
    primary: TickerProvider & OrderProvider;
    fallback?: TickerProvider & OrderProvider;
  }) {
    this.primary = opts.primary;
    this.fallback = opts.fallback;
  }

  async execute<T>(fn: (provider: TickerProvider & OrderProvider) => Promise<T>): Promise<ProviderResult<T>> {
    const start = performance.now();
    const breaker = this.primary.circuitBreaker;

    try {
      const result = await fn(this.primary);
      const latencyMs = Math.round(performance.now() - start);
      return {
        ok: true,
        data: result,
        provenance: { provider: this.primary.name, latencyMs, circuitState: breaker.getState() },
      };
    } catch (err) {
      if (!this.fallback) {
        const latencyMs = Math.round(performance.now() - start);
        return {
          ok: false,
          error: err instanceof Error ? err.message : 'Unknown provider error',
          provenance: { provider: this.primary.name, latencyMs, circuitState: breaker.getState() },
        };
      }

      try {
        const fbStart = performance.now();
        const fbResult = await fn(this.fallback);
        const latencyMs = Math.round(performance.now() - fbStart);
        return {
          ok: true,
          data: fbResult,
          provenance: { provider: this.fallback.name, latencyMs, circuitState: this.fallback.circuitBreaker.getState() },
        };
      } catch (fbErr) {
        const latencyMs = Math.round(performance.now() - start);
        const message = fbErr instanceof Error ? fbErr.message : 'Unknown provider error';
        return {
          ok: false,
          error: `${this.primary.name}: ${message} (fallback ${this.fallback.name} also failed)`,
          provenance: { provider: this.primary.name, latencyMs, circuitState: breaker.getState() },
        };
      }
    }
  }
}