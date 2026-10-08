// Strategy Promotion State Machine — transition table and pure transition logic.

import type {
  StrategyPhase,
  TransitionTrigger,
  TransitionResult,
  GateResultInput,
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

  return TRANSITIONS[phase]?.[trigger.type] ?? null;
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
 * Map a promotion or survival gate result onto a transition trigger.
 * `PASSED` / `PAPER_CANDIDATE` advances the lifecycle one step (up to SHADOW);
 * `KILLED` terminates it.
 */
export function gateResultToTrigger(
  result: GateResultInput,
): TransitionTrigger {
  if (typeof result === 'string') {
    return result === 'PASSED' || result === 'PAPER_CANDIDATE'
      ? { type: 'gate_passed' }
      : { type: 'gate_failed' };
  }
  if ('verdict' in result) {
    return result.verdict === 'PASSED'
      ? { type: 'gate_passed' }
      : { type: 'gate_failed' };
  }
  return result.status === 'PASSED' || result.status === 'PAPER_CANDIDATE'
    ? { type: 'gate_passed' }
    : { type: 'gate_failed' };
}
