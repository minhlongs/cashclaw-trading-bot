// Strategy Promotion State Machine — transition table and pure transition logic.

import type {
  StrategyPhase,
  TransitionTrigger,
  TransitionResult,
} from './promotion-states-types';

// ── Transition table ───────────────────────────────────────────────────────────

// Forward-only map. `gate_passed` is capped at SHADOW (the automated ceiling);
// MANUAL_APPROVAL and LIVE are reachable only through explicit human triggers.
const TRANSITIONS: Record<StrategyPhase, Partial<Record<TransitionTrigger['type'], StrategyPhase>>> = {
  RESEARCH: { gate_passed: 'BACKTEST', gate_failed: 'KILLED', demote: 'RESEARCH' },
  BACKTEST: { gate_passed: 'OOS_PASS', gate_failed: 'KILLED', demote: 'RESEARCH' },
  OOS_PASS: { gate_passed: 'ROBUSTNESS_PASS', gate_failed: 'KILLED', demote: 'RESEARCH' },
  ROBUSTNESS_PASS: { gate_passed: 'PAPER', gate_failed: 'KILLED', demote: 'RESEARCH' },
  PAPER: { gate_passed: 'SHADOW', gate_failed: 'KILLED', demote: 'RESEARCH' },
  SHADOW: { gate_failed: 'KILLED', demote: 'RESEARCH' },
  MANUAL_APPROVAL: { promote: 'LIVE', demote: 'RESEARCH' },
  LIVE: {},
  KILLED: {},
};

// ── Public API ─────────────────────────────────────────────────────────────────

/** States from which no trigger produces a different state. */
export function isTerminalPhase(phase: StrategyPhase): boolean {
  return phase === 'LIVE' || phase === 'KILLED';
}

/** True when `trigger` moves `phase` to a different state. */
export function canTransition(
  phase: StrategyPhase,
  trigger: TransitionTrigger,
): boolean {
  return getTransition(phase, trigger) !== null;
}

/**
 * Apply a trigger to a phase.
 *
 * Returns the new phase, or null when the trigger is not valid from this
 * state (including any attempt to advance past SHADOW automatically).
 */
export function getTransition(
  phase: StrategyPhase,
  trigger: TransitionTrigger,
): StrategyPhase | null {
  if (isTerminalPhase(phase)) return null;

  if (trigger.type === 'manual_approval') {
    // Manual approval is only valid from SHADOW. Approved → MANUAL_APPROVAL;
    // rejected → KILLED. This is the only route into MANUAL_APPROVAL.
    if (phase !== 'SHADOW') return null;
    return trigger.approved ? 'MANUAL_APPROVAL' : 'KILLED';
  }

  return TRANSITIONS[phase][trigger.type] ?? null;
}

/**
 * Transition a strategy, throwing on an invalid move.
 *
 * Use this when an invalid transition is a programming error (e.g. a pipeline
 * step that fires the wrong trigger). Use `getTransition` when an invalid move
 * is a legitimate input (e.g. a user clicking a disabled button).
 */
export function transitionStrategy(
  phase: StrategyPhase,
  trigger: TransitionTrigger,
): TransitionResult {
  const to = getTransition(phase, trigger);
  if (to === null) {
    throw new Error(
      `Invalid transition: ${phase} + ${trigger.type}` +
        (trigger.type === 'manual_approval' ? `(${trigger.approved})` : '') +
        ` — no valid target`,
    );
  }
  return { from: phase, to, trigger };
}

/**
 * Map a survival-gate result onto a transition trigger.
 *
 * `PAPER_CANDIDATE` advances the lifecycle one step; `KILLED` terminates it.
 * This is the only integration point between the gate and the state machine.
 */
export function gateResultToTrigger(
  gateStatus: 'PAPER_CANDIDATE' | 'KILLED',
): TransitionTrigger {
  return gateStatus === 'PAPER_CANDIDATE'
    ? { type: 'gate_passed' }
    : { type: 'gate_failed' };
}
