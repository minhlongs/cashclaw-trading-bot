// Circuit Breaker — triple-state FSM wrapping any async function.
// Opens after N consecutive failures; half-opens after cooldown.
// Goal: protect providers from cascading failure, rather than hammering a degraded endpoint.

export type CircuitState = 'closed' | 'open' | 'half_open';

export interface CircuitBreakerOptions {
  threshold: number;      // consecutive failures to trip open
  cooldownMs: number;      // full cooldown before half-open attempt (from trip moment)
  halfOpenAfterMs: number; // minimum time in open before half-open trial
}

export class CircuitBreaker {
  private state: CircuitState = 'closed';
  private failureCount = 0;

  private readonly threshold: number;
  private readonly cooldownMs: number;
  private readonly halfOpenAfterMs: number;

  private trippedAt: number | null = null;
  private halfOpenAt: number | null = null;

  constructor(opts: CircuitBreakerOptions) {
    this.threshold = opts.threshold;
    this.cooldownMs = opts.cooldownMs;
    this.halfOpenAfterMs = opts.halfOpenAfterMs;
  }

  getState(): CircuitState {
    this.update();
    return this.state;
  }

  reset(): void {
    this.state = 'closed';
    this.failureCount = 0;
    this.trippedAt = null;
    this.halfOpenAt = null;
  }

  /** Wrap any async function with circuit-breaker protection */
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
      this.onFailure();
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

    if (this.state === 'half_open') {
      this.state = 'closed';
    }
    // in 'closed' state, nothing changes
  }

  private onFailure(): void {
    this.failureCount += 1;

    if (this.state === 'half_open') {
      // Any failure during half-open immediately reopens
      this.trip();
      return;
    }

    if (this.failureCount >= this.threshold) {
      this.trip();
    }
    // below threshold in 'closed' → just increment
  }

  private trip(): void {
    const now = Date.now();
    this.trippedAt = now;
    this.halfOpenAt = now + this.cooldownMs + this.halfOpenAfterMs;
    this.state = 'open';
  }

  /** Evaluate state transitions based on elapsed time */
  private update(): void {
    if (this.state !== 'open') return;

    const now = Date.now();
    const untilHalfOpen = this.halfOpenAt ? Math.max(0, this.halfOpenAt - now) : 0;

    // After full cooldown period, transition to half_open
    // (halfOpenAt = tripTime + cooldownMs + halfOpenAfterMs)
    if (untilHalfOpen === 0) {
      this.state = 'half_open';
      // Keep failureCount intact so a single failed trial reopens
    }
  }

  private getRemainingCooldownMs(): number {
    if (!this.halfOpenAt) return 0;
    const remaining = this.halfOpenAt - Date.now();
    return Math.max(0, remaining);
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
