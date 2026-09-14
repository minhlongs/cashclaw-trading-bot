import type { FailureKind } from './circuit-breaker-kinds';
import {
  createEmptyKindCounters,
  type CircuitState,
  type KindCounters,
  type StateTransitionResult,
} from './circuit-breaker-types';

export class CircuitStateMachine {
  private state: CircuitState = 'closed';
  private failureCount = 0;
  private currentKind: FailureKind = 'unknown';
  private kindCounters: KindCounters = createEmptyKindCounters();
  private degradedKind: FailureKind | null = null;
  private trippedAt: number | null = null;
  private halfOpenAt: number | null = null;

  constructor(
    private readonly cooldownMs: number,
    private readonly halfOpenAfterMs: number,
  ) {}

  getState(): CircuitState { return this.state; }
  getFailureCount(): number { return this.failureCount; }
  getTrippedAt(): number | null { return this.trippedAt; }
  getHalfOpenAt(): number | null { return this.halfOpenAt; }
  getCurrentKind(): FailureKind { return this.currentKind; }
  getDegradedKind(): FailureKind | null { return this.degradedKind; }
  getKindCounters(): Readonly<KindCounters> { return { ...this.kindCounters }; }

  getRemainingCooldownMs(now = Date.now()): number {
    if (!this.halfOpenAt) return 0;
    return Math.max(0, this.halfOpenAt - now);
  }

  reset(): void {
    this.failureCount = 0;
    this.trippedAt = null;
    this.halfOpenAt = null;
    this.currentKind = 'unknown';
    this.kindCounters = createEmptyKindCounters();
    this.degradedKind = null;
    this.state = 'closed';
  }

  hydrate(rowState: CircuitState, failureCount: number, cooldownUntil: number | null, now = Date.now()): void {
    this.state = rowState;
    this.failureCount = failureCount;
    this.halfOpenAt = cooldownUntil;
    if (cooldownUntil && cooldownUntil <= now) {
      this.state = 'half_open';
      this.halfOpenAt = null;
    }
    this.update(now);
  }

  trip(kind?: FailureKind, now = Date.now()): StateTransitionResult | null {
    const prev = this.state;
    this.trippedAt = now;
    this.halfOpenAt = now + this.cooldownMs + this.halfOpenAfterMs;
    this.state = 'open';
    this.kindCounters = createEmptyKindCounters();
    this.degradedKind = null;
    if (prev !== 'open') {
      return { from: prev, to: 'open', timestamp: now, kind };
    }
    return null;
  }

  recordSuccess(now = Date.now()): StateTransitionResult | null {
    this.failureCount = 0;
    this.trippedAt = null;
    this.halfOpenAt = null;
    this.currentKind = 'unknown';
    this.kindCounters = createEmptyKindCounters();
    this.degradedKind = null;

    if (this.state === 'half_open' || this.state === 'degraded') {
      const prev = this.state;
      this.state = 'closed';
      return { from: prev, to: 'closed', timestamp: now, kind: undefined };
    }
    return null;
  }

  recordFailure(kind: FailureKind, threshold: number, now = Date.now()): StateTransitionResult | null {
    this.kindCounters[kind] += 1;
    this.failureCount += 1;
    this.currentKind = kind;

    if (this.state === 'half_open') {
      return this.trip(kind, now);
    }

    if (this.state === 'degraded') {
      if (kind === this.degradedKind) {
        return this.trip(kind, now);
      }
      this.degradedKind = kind;
      return null;
    }

    if (this.kindCounters[kind] >= threshold) {
      const prev = this.state;
      this.state = 'degraded';
      this.kindCounters = createEmptyKindCounters();
      this.degradedKind = kind;
      return { from: prev, to: 'degraded', timestamp: now, kind };
    }

    return null;
  }

  update(now = Date.now()): StateTransitionResult | null {
    if (this.state !== 'open' || !this.halfOpenAt) return null;

    const until = this.halfOpenAt - now;
    if (until <= 0) {
      this.halfOpenAt = null;
      this.currentKind = 'unknown';
      this.kindCounters = createEmptyKindCounters();
      this.degradedKind = null;
      const prev = this.state;
      this.state = 'half_open';
      return { from: prev, to: 'half_open', timestamp: now, kind: undefined };
    }
    return null;
  }
}
