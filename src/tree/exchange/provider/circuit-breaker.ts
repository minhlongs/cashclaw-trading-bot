// Circuit Breaker — four-state FSM wrapping any async function.
// States: closed → degraded → open → half_open → (closed | open)
// Kind-aware thresholds let different failure root causes trip at different rates.
// D1 persistence survives CF Workers stateless restarts.

import { classifyFailure, FAILURE_KIND_THRESHOLDS, type FailureKind } from './circuit-breaker-kinds';
import { saveState, loadState } from './circuit-persistence';
import type { D1Database } from '@/lib/db/client';
export type CircuitState = 'closed' | 'degraded' | 'open' | 'half_open';

export interface CircuitBreakerOptions {
  id?: string;             // optional provider/bot identifier for D1 persistence
  provider?: string;       // optional provider label for D1 rows
  db?: D1Database | null;  // optional D1 handle; falls back to no-op when null
  cooldownMs: number;      // full cooldown before half-open attempt (from trip moment)
  halfOpenAfterMs: number; // minimum time in open before half-open trial
  onStateChange?: (from: CircuitState, to: CircuitState, timestamp: number, kind?: FailureKind) => void;
}

export class CircuitBreaker {
  private state: CircuitState = 'closed';
  private failureCount = 0;
  private readonly cooldownMs: number;
  private readonly halfOpenAfterMs: number;
  private readonly opts: CircuitBreakerOptions;

  private currentKind: FailureKind = 'unknown';
  private kindCounters: Record<FailureKind, number> = {
    timeout: 0,
    rate_limit: 0,
    server_error: 0,
    network: 0,
    unknown: 0,
  };
  // Once in DEGRADED, the next failure of this kind trips OPEN directly.
  private degradedKind: FailureKind | null = null;

  private trippedAt: number | null = null;
  private halfOpenAt: number | null = null;

  constructor(opts: CircuitBreakerOptions) {
    this.opts = opts;
    this.cooldownMs = opts.cooldownMs;
    this.halfOpenAfterMs = opts.halfOpenAfterMs;
    if (opts.id) {
      void this.restoreState(opts.id);
    }
  }

  private setState(next: CircuitState, kind?: FailureKind): void {
    const prev = this.state;
    this.state = next;
    if (prev !== next && this.opts.onStateChange) {
      this.opts.onStateChange(prev, next, Date.now(), kind);
    }
    if (next === 'degraded') {
      this.kindCounters = {
        timeout: 0,
        rate_limit: 0,
        server_error: 0,
        network: 0,
        unknown: 0,
      };
      this.degradedKind = kind ?? null;
    } else {
      this.kindCounters = {
        timeout: 0,
        rate_limit: 0,
        server_error: 0,
        network: 0,
        unknown: 0,
      };
      this.degradedKind = null;
    }
  }

  getState(): CircuitState {
    this.update();
    return this.state;
  }

  reset(): void {
    this.failureCount = 0;
    this.trippedAt = null;
    this.halfOpenAt = null;
    this.currentKind = 'unknown';
    this.kindCounters = {
      timeout: 0,
      rate_limit: 0,
      server_error: 0,
      network: 0,
      unknown: 0,
    };
    this.degradedKind = null;
    if (this.state !== 'closed') {
      this.state = 'closed';
    }
  }

  async persistState(): Promise<void> {
    if (!this.opts.id) return;
    await saveState(this.opts.db ?? null, this.opts.id, this.opts.provider ?? 'unknown', this.state, this.failureCount, this.halfOpenAt ?? undefined);
  }

  async restoreState(id: string): Promise<CircuitState | null> {
    const row = await loadState(this.opts.db ?? null, id);
    if (!row) return null;

    this.state = row.state;
    this.failureCount = row.failureCount;
    this.halfOpenAt = row.cooldownUntil;
    if (row.cooldownUntil && row.cooldownUntil <= Date.now()) {
      this.state = 'half_open';
      this.halfOpenAt = null;
    }
    this.update();
    return this.state;
  }

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    this.update();

    if (this.state === 'open') {
      const remaining = this.getRemainingCooldownMs();
      throw new CircuitOpenError(remaining);
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (err) {
      this.onFailure(err);
      throw err;
    }
  }

  getFailureCount(): number {
    this.update();
    return this.failureCount;
  }

  private onSuccess(): void {
    this.failureCount = 0;
    this.trippedAt = null;
    this.halfOpenAt = null;
    this.currentKind = 'unknown';
    this.kindCounters = {
      timeout: 0,
      rate_limit: 0,
      server_error: 0,
      network: 0,
      unknown: 0,
    };
    this.degradedKind = null;

    if (this.state === 'half_open' || this.state === 'degraded') {
      const prev = this.state;
      this.state = 'closed';
      if (this.opts.onStateChange) {
        this.opts.onStateChange(prev, 'closed', Date.now(), undefined);
      }
    }
    void this.persistState();
  }

  private onFailure(err?: unknown): void {
    const kind = err !== undefined ? classifyFailure(err) : 'unknown';
    const threshold = FAILURE_KIND_THRESHOLDS[kind].threshold;

    this.kindCounters[kind] += 1;
    this.failureCount += 1;
    this.currentKind = kind;

    if (this.state === 'half_open') {
      this.trip(kind);
      return;
    }

    if (this.state === 'degraded') {
      if (kind === this.degradedKind) {
        this.trip(kind);
        return;
      }
      this.degradedKind = kind;
      return;
    }

    if (this.kindCounters[kind] >= threshold) {
      this.degradedKind = kind;
      this.setState('degraded', kind);
    }
    void this.persistState();
  }

  private trip(kind?: FailureKind): void {
    const now = Date.now();
    this.trippedAt = now;
    this.halfOpenAt = now + this.cooldownMs + this.halfOpenAfterMs;
    this.setState('open', kind);
    void this.persistState();
  }

  private update(): void {
    if (this.state !== 'open') return;
    if (!this.halfOpenAt) return;

    const until = this.halfOpenAt - Date.now();
    if (until <= 0) {
      this.halfOpenAt = null;
      this.currentKind = 'unknown';
      this.kindCounters = {
        timeout: 0,
        rate_limit: 0,
        server_error: 0,
        network: 0,
        unknown: 0,
      };
      this.degradedKind = null;
      this.setState('half_open');
    }
  }

  private getRemainingCooldownMs(): number {
    if (!this.halfOpenAt) return 0;
    return Math.max(0, this.halfOpenAt - Date.now());
  }
}

export class CircuitOpenError extends Error {
  constructor(
    public readonly retryAfterMs: number,
  ) {
    super(`circuit_open — retry after ${retryAfterMs}ms`);
    this.name = 'CircuitOpenError';
  }
}