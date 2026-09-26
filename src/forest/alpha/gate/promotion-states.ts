// Strategy Promotion State Machine — Alpha Research OS Phase 9
//
// Every candidate strategy flows through a fixed lifecycle. The machine is a
// pure function over states and triggers: no I/O, no randomness, no data fetch.
// It exists to make the safety boundary compile-time instead of convention.
//
//   RESEARCH → BACKTEST → OOS_PASS → ROBUSTNESS_PASS → PAPER → SHADOW
//       ↓          ↓           ↓              ↓             ↓        ↓
//     KILLED    KILLED      KILLED         KILLED       KILLED   MANUAL_APPROVAL → LIVE
//
// Key invariants:
// 1. `gate_passed` never advances past SHADOW (AUTOMATED_CEILING).
// 2. Reaching LIVE or MANUAL_APPROVAL strictly requires explicit human trigger.
// 3. KILLED and LIVE are terminal: no trigger moves them anywhere.

import type { PromotionGateResult } from './types';

// ── Types ──────────────────────────────────────────────────────────────────────

export type StrategyPhase =
  | 'RESEARCH'
  | 'BACKTEST'
  | 'OOS_PASS'
  | 'ROBUSTNESS_PASS'
  | 'PAPER'
  | 'SHADOW'
  | 'MANUAL_APPROVAL'
  | 'LIVE'
  | 'KILLED';

export interface GatePassed {
  readonly type: 'gate_passed';
}

export interface GateFailed {
  readonly type: 'gate_failed';
}

export interface ManualApproval {
  readonly type: 'manual_approval';
  readonly approved: boolean;
}

export interface Promote {
  readonly type: 'promote';
}

export interface Demote {
  readonly type: 'demote';
}

export type TransitionTrigger =
  | GatePassed
  | GateFailed
  | ManualApproval
  | Promote
  | Demote;

export interface TransitionResult {
  readonly from: StrategyPhase;
  readonly to: StrategyPhase;
  readonly trigger: TransitionTrigger;
}

export type GateResultInput =
  | PromotionGateResult
  | 'PASSED'
  | 'PAPER_CANDIDATE'
  | 'KILLED'
  | { readonly verdict: 'PASSED' | 'KILLED' }
  | { readonly status: 'PASSED' | 'PAPER_CANDIDATE' | 'KILLED' };

export type AutomatedProgressionPhase =
  | 'RESEARCH'
  | 'BACKTEST'
  | 'OOS_PASS'
  | 'ROBUSTNESS_PASS'
  | 'PAPER';

export type AutomatedTransitionTarget<P extends AutomatedProgressionPhase> =
  P extends 'RESEARCH' ? 'BACKTEST' :
  P extends 'BACKTEST' ? 'OOS_PASS' :
  P extends 'OOS_PASS' ? 'ROBUSTNESS_PASS' :
  P extends 'ROBUSTNESS_PASS' ? 'PAPER' :
  P extends 'PAPER' ? 'SHADOW' :
  never;

export type PhaseAfterGatePassed<P extends StrategyPhase> =
  P extends AutomatedProgressionPhase ? AutomatedTransitionTarget<P> : never;

// ── Transition table ───────────────────────────────────────────────────────────

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

export const AUTOMATED_CEILING = 'SHADOW' as const;
export type AutomatedCeiling = typeof AUTOMATED_CEILING;

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
    if (phase !== 'SHADOW') return null;
    return trigger.approved ? 'MANUAL_APPROVAL' : 'KILLED';
  }

  return TRANSITIONS[phase]?.[trigger.type] ?? null;
}

/**
 * Transition a strategy, throwing on an invalid move.
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
 *
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