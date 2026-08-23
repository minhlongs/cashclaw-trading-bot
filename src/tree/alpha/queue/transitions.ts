// Research Queue — State Machine
//
// Every research job flows through a fixed lifecycle. The machine is a
// pure function over states and triggers: no I/O, no randomness, no
// data fetch. Same transition-table doctrine as the promotion state
// machine (src/forest/alpha/gate/promotion-states.ts).
//
//   PROPOSED → VALIDATING → RUNNING → EVALUATED → SURVIVED → ARCHIVED
//       ↓           ↓           ↓          ↓
//    ARCHIVED    FALSIFIED   FALSIFIED  FALSIFIED
//
// Invariants enforced by the table, not comments:
// 1. No transition skips a stage.
// 2. ARCHIVED is terminal: no trigger escapes it.
// 3. SURVIVED is only reachable via the `survived` trigger, which the
//    caller derives from the multiple-testing verdict — a single lucky
//    OOS window cannot produce it.

import type { QueueState, QueueTrigger, TransitionRecord } from './types';

// ── Transition table ─────────────────────────────────────────────────────────

const TRANSITIONS: Record<QueueState, Partial<Record<QueueTrigger, QueueState>>> = {
  PROPOSED: { validate: 'VALIDATING', withdraw: 'ARCHIVED' },
  VALIDATING: { validation_passed: 'RUNNING', validation_failed: 'FALSIFIED' },
  RUNNING: { evaluation_complete: 'EVALUATED', run_failed: 'FALSIFIED' },
  EVALUATED: { survived: 'SURVIVED', falsified: 'FALSIFIED' },
  SURVIVED: { archive: 'ARCHIVED' },
  FALSIFIED: { archive: 'ARCHIVED' },
  ARCHIVED: {},
};

// ── Public API ───────────────────────────────────────────────────────────────

/** States from which no trigger produces a different state. */
export function isTerminalQueueState(state: QueueState): boolean {
  return state === 'ARCHIVED';
}

/** True when `trigger` moves `state` to a different state. */
export function canTransitionJob(state: QueueState, trigger: QueueTrigger): boolean {
  return getJobTransition(state, trigger) !== null;
}

/**
 * Look up the target state for a trigger, or null when the trigger is
 * not valid from this state (including any attempt to leave ARCHIVED).
 */
export function getJobTransition(
  state: QueueState,
  trigger: QueueTrigger,
): QueueState | null {
  return TRANSITIONS[state][trigger] ?? null;
}

/**
 * Transition a job, throwing on an invalid move.
 *
 * Use this when an invalid transition is a programming error (a pipeline
 * step firing the wrong trigger). Use `getJobTransition` when an invalid
 * move is a legitimate input.
 */
export function transitionJob(
  state: QueueState,
  trigger: QueueTrigger,
): TransitionRecord {
  const to = getJobTransition(state, trigger);
  if (to === null) {
    throw new Error(`Invalid transition: ${state} + ${trigger}`);
  }
  return { from: state, to, trigger };
}
