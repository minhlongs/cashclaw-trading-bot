// Circuit Breaker — four-state FSM wrapping any async function.
// States: closed → degraded → open → half_open → (closed | open)
// Kind-aware thresholds let different failure root causes trip at different rates.
// D1 persistence survives CF Workers stateless restarts.

import { classifyFailure, FAILURE_KIND_THRESHOLDS } from './circuit-breaker-kinds';
import { saveState, loadState } from './circuit-persistence';
import {
  type CircuitState,
  type CircuitBreakerOptions,
  type StateTransitionResult,
  CircuitOpenError,
} from './circuit-breaker-types';
import { CircuitStateMachine } from './circuit-breaker-state';

export type { CircuitState, CircuitBreakerOptions };
export { CircuitOpenError };

export class CircuitBreaker {
  private readonly fsm: CircuitStateMachine;
  private readonly opts: CircuitBreakerOptions;

  constructor(opts: CircuitBreakerOptions) {
    this.opts = opts;
    this.fsm = new CircuitStateMachine(opts.cooldownMs, opts.halfOpenAfterMs);
    if (opts.id) {
      void this.restoreState(opts.id);
    }
  }

  private notify(transition: StateTransitionResult | null): void {
    if (transition && this.opts.onStateChange) {
      this.opts.onStateChange(transition.from, transition.to, transition.timestamp, transition.kind);
    }
  }

  getState(): CircuitState {
    this.notify(this.fsm.update());
    return this.fsm.getState();
  }

  getFailureCount(): number {
    this.notify(this.fsm.update());
    return this.fsm.getFailureCount();
  }

  reset(): void {
    this.fsm.reset();
  }

  async persistState(): Promise<void> {
    if (!this.opts.id) return;
    await saveState(
      this.opts.db ?? null,
      this.opts.id,
      this.opts.provider ?? 'unknown',
      this.fsm.getState(),
      this.fsm.getFailureCount(),
      this.fsm.getHalfOpenAt() ?? undefined,
    );
  }

  async restoreState(id: string): Promise<CircuitState | null> {
    const row = await loadState(this.opts.db ?? null, id);
    if (!row) return null;

    this.fsm.hydrate(row.state, row.failureCount, row.cooldownUntil);
    this.notify(this.fsm.update());
    return this.fsm.getState();
  }

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    this.notify(this.fsm.update());

    if (this.fsm.getState() === 'open') {
      const remaining = this.fsm.getRemainingCooldownMs();
      throw new CircuitOpenError(remaining);
    }

    try {
      const result = await fn();
      this.notify(this.fsm.recordSuccess());
      void this.persistState();
      return result;
    } catch (err) {
      const kind = classifyFailure(err);
      const threshold = FAILURE_KIND_THRESHOLDS[kind].threshold;
      this.notify(this.fsm.recordFailure(kind, threshold));
      void this.persistState();
      throw err;
    }
  }
}
