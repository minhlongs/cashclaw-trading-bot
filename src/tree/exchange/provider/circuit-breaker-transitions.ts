import type { FailureKind } from './circuit-breaker-kinds';
import { createEmptyKindCounters, type CircuitState, type KindCounters, type StateTransitionResult } from './circuit-breaker-types';

export interface CircuitStateMutable {
  state: CircuitState; failureCount: number; currentKind: FailureKind;
  kindCounters: KindCounters; degradedKind: FailureKind | null;
  trippedAt: number | null; halfOpenAt: number | null;
  readonly cooldownMs: number; readonly halfOpenAfterMs: number;
}

export function applyTrip(ctx: CircuitStateMutable, kind?: FailureKind, now = Date.now()): StateTransitionResult | null {
  const prev = ctx.state; ctx.trippedAt = now; ctx.halfOpenAt = now + ctx.cooldownMs + ctx.halfOpenAfterMs;
  ctx.state = 'open'; ctx.kindCounters = createEmptyKindCounters(); ctx.degradedKind = null;
  return prev !== 'open' ? { from: prev, to: 'open', timestamp: now, kind } : null;
}

export function applySuccess(ctx: CircuitStateMutable, now = Date.now()): StateTransitionResult | null {
  ctx.failureCount = 0; ctx.trippedAt = null; ctx.halfOpenAt = null; ctx.currentKind = 'unknown';
  ctx.kindCounters = createEmptyKindCounters(); ctx.degradedKind = null;
  if (ctx.state === 'half_open' || ctx.state === 'degraded') {
    const prev = ctx.state; ctx.state = 'closed';
    return { from: prev, to: 'closed', timestamp: now, kind: undefined };
  }
  return null;
}

export function applyFailure(ctx: CircuitStateMutable, kind: FailureKind, threshold: number, now = Date.now()): StateTransitionResult | null {
  ctx.kindCounters[kind] += 1; ctx.failureCount += 1; ctx.currentKind = kind;
  if (ctx.state === 'half_open') return applyTrip(ctx, kind, now);
  if (ctx.state === 'degraded') {
    if (kind === ctx.degradedKind) return applyTrip(ctx, kind, now);
    ctx.degradedKind = kind; return null;
  }
  if (ctx.kindCounters[kind] >= threshold) {
    const prev = ctx.state; ctx.state = 'degraded'; ctx.kindCounters = createEmptyKindCounters();
    ctx.degradedKind = kind; return { from: prev, to: 'degraded', timestamp: now, kind };
  }
  return null;
}

export function applyUpdate(ctx: CircuitStateMutable, now = Date.now()): StateTransitionResult | null {
  if (ctx.state !== 'open' || !ctx.halfOpenAt || ctx.halfOpenAt - now > 0) return null;
  ctx.halfOpenAt = null; ctx.currentKind = 'unknown'; ctx.kindCounters = createEmptyKindCounters(); ctx.degradedKind = null;
  const prev = ctx.state; ctx.state = 'half_open';
  return { from: prev, to: 'half_open', timestamp: now, kind: undefined };
}
