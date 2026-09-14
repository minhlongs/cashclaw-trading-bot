import type { FailureKind } from './circuit-breaker-kinds';
import type { D1Database } from '@/lib/db/client';

export type CircuitState = 'closed' | 'degraded' | 'open' | 'half_open';

export interface CircuitBreakerOptions {
  id?: string;
  provider?: string;
  db?: D1Database | null;
  cooldownMs: number;
  halfOpenAfterMs: number;
  onStateChange?: (from: CircuitState, to: CircuitState, timestamp: number, kind?: FailureKind) => void;
}

export interface StateTransitionResult {
  from: CircuitState;
  to: CircuitState;
  timestamp: number;
  kind?: FailureKind;
}

export type KindCounters = Record<FailureKind, number>;

export function createEmptyKindCounters(): KindCounters {
  return {
    timeout: 0,
    rate_limit: 0,
    server_error: 0,
    network: 0,
    unknown: 0,
  };
}

export class CircuitOpenError extends Error {
  constructor(public readonly retryAfterMs: number) {
    super(`circuit_open — retry after ${retryAfterMs}ms`);
    this.name = 'CircuitOpenError';
  }
}
