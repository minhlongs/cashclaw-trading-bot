// Strategy Promotion State Machine — types and lifecycle definitions.

import type { PromotionGateResult } from './types';

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

/** The automated ceiling: `gate_passed` will not advance past this phase. */
export const AUTOMATED_CEILING = 'SHADOW' as const;
export type AutomatedCeiling = typeof AUTOMATED_CEILING;
