// Deliberation Feedback — pure state transition mapping survival verdicts back to debate states
import type { SurvivalGateResult } from '@/forest/alpha/gate/survival-gate';
import type { DebateState } from '@/tree/research/tradingagents/debate-state';

export interface DeliberationFeedbackOutcome {
  readonly debateId: string;
  readonly survivalStatus: 'PAPER_CANDIDATE' | 'KILLED';
  readonly updatedStatus: 'PROMOTED_TO_PAPER' | 'FALSIFIED_KILLED';
  readonly summary: string;
  readonly timestamp: string;
}

export function applyDeliberationFeedback(
  debateState: DebateState,
  gateResult: SurvivalGateResult,
  nowIso = new Date().toISOString(),
): DeliberationFeedbackOutcome {
  const isCandidate = gateResult.status === 'PAPER_CANDIDATE';
  return {
    debateId: debateState.proposalId || 'unknown-debate',
    survivalStatus: gateResult.status,
    updatedStatus: isCandidate ? 'PROMOTED_TO_PAPER' : 'FALSIFIED_KILLED',
    summary: gateResult.reason,
    timestamp: nowIso,
  };
}
