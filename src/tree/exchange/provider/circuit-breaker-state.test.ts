import { describe, it, expect } from 'vitest';
import { CircuitStateMachine } from './circuit-breaker-state';

describe('CircuitStateMachine', () => {
  it('starts in closed state with zero failures', () => {
    const fsm = new CircuitStateMachine(5000, 2000);
    expect(fsm.getState()).toBe('closed');
    expect(fsm.getFailureCount()).toBe(0);
    expect(fsm.getTrippedAt()).toBeNull();
    expect(fsm.getHalfOpenAt()).toBeNull();
    expect(fsm.getCurrentKind()).toBe('unknown');
    expect(fsm.getDegradedKind()).toBeNull();
    expect(fsm.getRemainingCooldownMs()).toBe(0);
  });

  it('transitions to degraded upon reaching failure threshold', () => {
    const fsm = new CircuitStateMachine(5000, 2000);
    expect(fsm.recordFailure('timeout', 3, 1000)).toBeNull();
    expect(fsm.recordFailure('timeout', 3, 1001)).toBeNull();
    expect(fsm.getState()).toBe('closed');

    const transition = fsm.recordFailure('timeout', 3, 1002);
    expect(transition).toEqual({
      from: 'closed',
      to: 'degraded',
      timestamp: 1002,
      kind: 'timeout',
    });
    expect(fsm.getState()).toBe('degraded');
    expect(fsm.getDegradedKind()).toBe('timeout');
  });

  it('transitions from degraded to open on same-kind failure', () => {
    const fsm = new CircuitStateMachine(5000, 2000);
    fsm.recordFailure('timeout', 1, 1000);
    expect(fsm.getState()).toBe('degraded');

    const transition = fsm.recordFailure('timeout', 1, 1010);
    expect(transition).toEqual({
      from: 'degraded',
      to: 'open',
      timestamp: 1010,
      kind: 'timeout',
    });
    expect(fsm.getState()).toBe('open');
    expect(fsm.getHalfOpenAt()).toBe(1010 + 5000 + 2000);
    expect(fsm.getRemainingCooldownMs(2000)).toBe(6010);
  });

  it('updates degradedKind on different kind failure while degraded', () => {
    const fsm = new CircuitStateMachine(5000, 2000);
    fsm.recordFailure('timeout', 1, 1000);
    expect(fsm.getDegradedKind()).toBe('timeout');

    const transition = fsm.recordFailure('rate_limit', 5, 1005);
    expect(transition).toBeNull();
    expect(fsm.getState()).toBe('degraded');
    expect(fsm.getDegradedKind()).toBe('rate_limit');
  });

  it('transitions to half_open when cooldown expires during update', () => {
    const fsm = new CircuitStateMachine(5000, 2000);
    fsm.trip('network', 1000);
    expect(fsm.getState()).toBe('open');

    expect(fsm.update(7999)).toBeNull();
    expect(fsm.getState()).toBe('open');

    const transition = fsm.update(8000);
    expect(transition).toEqual({
      from: 'open',
      to: 'half_open',
      timestamp: 8000,
      kind: undefined,
    });
    expect(fsm.getState()).toBe('half_open');
    expect(fsm.getRemainingCooldownMs(8000)).toBe(0);
  });

  it('re-trips open immediately on failure in half_open', () => {
    const fsm = new CircuitStateMachine(5000, 2000);
    fsm.trip('server_error', 1000);
    fsm.update(8000);
    expect(fsm.getState()).toBe('half_open');

    const transition = fsm.recordFailure('server_error', 5, 8050);
    expect(transition).toEqual({
      from: 'half_open',
      to: 'open',
      timestamp: 8050,
      kind: 'server_error',
    });
    expect(fsm.getState()).toBe('open');
  });

  it('resets to closed and clears failure count on success in half_open or degraded', () => {
    const fsm = new CircuitStateMachine(5000, 2000);
    fsm.recordFailure('unknown', 1, 1000);
    expect(fsm.getState()).toBe('degraded');

    const transition = fsm.recordSuccess(1020);
    expect(transition).toEqual({
      from: 'degraded',
      to: 'closed',
      timestamp: 1020,
      kind: undefined,
    });
    expect(fsm.getState()).toBe('closed');
    expect(fsm.getFailureCount()).toBe(0);

    // Calling success while closed returns null
    expect(fsm.recordSuccess(1030)).toBeNull();
  });

  it('resets state without generating transition events', () => {
    const fsm = new CircuitStateMachine(5000, 2000);
    fsm.trip('timeout', 1000);
    expect(fsm.getState()).toBe('open');

    fsm.reset();
    expect(fsm.getState()).toBe('closed');
    expect(fsm.getFailureCount()).toBe(0);
    expect(fsm.getHalfOpenAt()).toBeNull();
    expect(fsm.getDegradedKind()).toBeNull();
  });

  it('hydrates state from persistent store and applies expired cooldown check', () => {
    const fsm = new CircuitStateMachine(5000, 2000);
    fsm.hydrate('open', 3, 5000, 6000);
    expect(fsm.getState()).toBe('half_open');
    expect(fsm.getFailureCount()).toBe(3);

    const fsm2 = new CircuitStateMachine(5000, 2000);
    fsm2.hydrate('open', 2, 8000, 6000);
    expect(fsm2.getState()).toBe('open');
    expect(fsm2.getRemainingCooldownMs(6000)).toBe(2000);
  });
});
