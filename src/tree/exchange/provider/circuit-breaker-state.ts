import type { FailureKind } from './circuit-breaker-kinds';
import { createEmptyKindCounters, type CircuitState, type KindCounters, type StateTransitionResult } from './circuit-breaker-types';
import { applyTrip, applySuccess, applyFailure, applyUpdate, type CircuitStateMutable } from './circuit-breaker-transitions';

export class CircuitStateMachine {
  private readonly ctx: CircuitStateMutable;

  constructor(cooldownMs: number, halfOpenAfterMs: number) {
    this.ctx = {
      state: 'closed', failureCount: 0, currentKind: 'unknown',
      kindCounters: createEmptyKindCounters(), degradedKind: null,
      trippedAt: null, halfOpenAt: null, cooldownMs, halfOpenAfterMs,
    };
  }

  getState(): CircuitState { return this.ctx.state; }
  getFailureCount(): number { return this.ctx.failureCount; }
  getTrippedAt(): number | null { return this.ctx.trippedAt; }
  getHalfOpenAt(): number | null { return this.ctx.halfOpenAt; }
  getCurrentKind(): FailureKind { return this.ctx.currentKind; }
  getDegradedKind(): FailureKind | null { return this.ctx.degradedKind; }
  getKindCounters(): Readonly<KindCounters> { return { ...this.ctx.kindCounters }; }
  getRemainingCooldownMs(now = Date.now()): number { return this.ctx.halfOpenAt ? Math.max(0, this.ctx.halfOpenAt - now) : 0; }

  reset(): void {
    this.ctx.failureCount = 0; this.ctx.trippedAt = null; this.ctx.halfOpenAt = null;
    this.ctx.currentKind = 'unknown'; this.ctx.kindCounters = createEmptyKindCounters();
    this.ctx.degradedKind = null; this.ctx.state = 'closed';
  }

  hydrate(rowState: CircuitState, failureCount: number, cooldownUntil: number | null, now = Date.now()): void {
    this.ctx.state = rowState; this.ctx.failureCount = failureCount; this.ctx.halfOpenAt = cooldownUntil;
    if (cooldownUntil && cooldownUntil <= now) { this.ctx.state = 'half_open'; this.ctx.halfOpenAt = null; }
    this.update(now);
  }

  trip(kind?: FailureKind, now = Date.now()): StateTransitionResult | null { return applyTrip(this.ctx, kind, now); }
  recordSuccess(now = Date.now()): StateTransitionResult | null { return applySuccess(this.ctx, now); }
  recordFailure(kind: FailureKind, threshold: number, now = Date.now()): StateTransitionResult | null { return applyFailure(this.ctx, kind, threshold, now); }
  update(now = Date.now()): StateTransitionResult | null { return applyUpdate(this.ctx, now); }
}
