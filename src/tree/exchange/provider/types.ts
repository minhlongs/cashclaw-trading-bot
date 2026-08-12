// Exchange Provider — abstraction layer for exchange health, budget, and backoff.
// Paper-only v1; LiveProviderConfig added in v2.

export type ProviderState = 'healthy' | 'degraded' | 'circuit_open' | 'cooldown';

export interface ProviderHealth {
  score: number;            // 0-100, 100 = perfect
  lastSuccess: number;      // timestamp ms
  failureCount: number;     // consecutive failures
  latencyMs: number;        // rolling average latency
}

export interface ProviderBudget {
  reqPerMin: number;
  reqPerHour: number;
}

export interface PaperProviderConfig {
  type: 'paper';
  exchangeId: string;
  initialBalances: { currency: string; total: number }[];
  tradingLimits?: {
    reqPerMin: number;
    reqPerHour: number;
  };
}

// LiveProviderConfig placeholder for v2
export type ProviderConfig = PaperProviderConfig;

export interface ExchangeProvider {
  readonly id: string;

  getHealth(): ProviderHealth;
  getBudget(): ProviderBudget;
  getConfig(): ProviderConfig;

  /** Record a successful call — reset failure count, update latency */
  recordSuccess(latencyMs: number): void;

  /** Record a failed call — increment failure count, degrade health */
  recordFailure(): void;

  /** Whether the provider is in a degraded or circuit-open state */
  isUnhealthy(): boolean;

  /** Backoff wait ms if in cooldown, 0 otherwise */
  getBackoffMs(): number;

  /** Whether the circuit breaker is open for this provider */
  isCircuitOpen(): boolean;
}
