import { describe, it, expect } from 'vitest';
import { applyDeliberationFeedback } from './deliberation-feedback';
import type { SurvivalGateResult } from '@/forest/alpha/gate/survival-gate';
import type { DebateState } from '@/tree/research/tradingagents/debate-state';

describe('deliberation-feedback', () => {
  const dummyDebateState: DebateState = {
    researchGoalId: 'goal-01',
    proposalId: 'prop-round-01',
    status: 'complete',
    rounds: [
      {
        round: 1,
        agentRole: 'bull',
        agentId: 'agent-1',
        content: 'Bull thesis',
      },
    ],
  };

  it('correctly maps PAPER_CANDIDATE to PROMOTED_TO_PAPER', () => {
    const passedResult: SurvivalGateResult = {
      status: 'PAPER_CANDIDATE',
      reason: 'All survival gate checks passed',
      checks: [],
    };

    const outcome = applyDeliberationFeedback(dummyDebateState, passedResult, '2026-10-08T00:00:00Z');
    expect(outcome.survivalStatus).toBe('PAPER_CANDIDATE');
    expect(outcome.updatedStatus).toBe('PROMOTED_TO_PAPER');
    expect(outcome.debateId).toBe('prop-round-01');
    expect(outcome.timestamp).toBe('2026-10-08T00:00:00Z');
  });

  it('correctly maps KILLED to FALSIFIED_KILLED', () => {
    const killedResult: SurvivalGateResult = {
      status: 'KILLED',
      reason: 'Failed expectancy and max drawdown',
      checks: [],
    };

    const outcome = applyDeliberationFeedback(dummyDebateState, killedResult, '2026-10-08T00:00:00Z');
    expect(outcome.survivalStatus).toBe('KILLED');
    expect(outcome.updatedStatus).toBe('FALSIFIED_KILLED');
    expect(outcome.summary).toContain('drawdown');
  });
});
