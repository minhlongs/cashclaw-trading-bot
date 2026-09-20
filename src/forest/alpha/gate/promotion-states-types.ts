// Strategy Promotion State Machine — types and lifecycle definitions.

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

/** The automated ceiling: `gate_passed` will not advance past this phase. */
export const AUTOMATED_CEILING: StrategyPhase = 'SHADOW';
