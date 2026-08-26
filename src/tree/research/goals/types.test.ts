// ResearchGoal + ResearchGoalAdapter — unit tests.
// Covers: Zod fail-closed per field group, binding universe/timeframe
// rejection, purity + determinism of the binding view.

import { describe, expect, it } from 'vitest';
import { parseResearchGoal } from './types';
import { bindHypothesisToGoal, goalBindingSummary } from './adapter';
import { parseResearchHypothesis } from '@/tree/research/hypothesis/types';
import type { ResearchHypothesis } from '@/tree/research/hypothesis/types';

function makeGoalInput(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'goal-0001-funding-research',
    objective: 'Evaluate funding-based reversal signals on perp majors',
    universe: {
      id: 'perp-majors',
      symbols: ['BTCUSDT', 'ETHUSDT', 'SOLUSDT'],
      weighting: 'equal',
      rebalanceRule: 'none',
    },
    timePeriod: { start: '2026-01-01T00:00:00.000Z', end: '2026-12-31T23:59:59.000Z' },
    constraints: ['no look-ahead features'],
    evidenceRequirements: ['OOS net expectancy after EXTREME costs'],
    successCriteria: ['OOS Sharpe > 1 after costs'],
    failureCriteria: ['Bootstrap CI includes 0 on OOS'],
    createdAt: '2026-01-01T00:00:00.000Z',
    createdBy: 'research-lead',
    ...overrides,
  };
}

function makeHypothesis(overrides: Record<string, unknown> = {}): ResearchHypothesis {
  const result = parseResearchHypothesis({
    id: 'hyp-0001-funding-fade',
    title: 'Funding fade',
    description: 'Extreme negative funding precedes short-horizon reversal',
    rationale: 'Crowded shorts pay funding; unwinds create reversal pressure',
    source: 'vibe-zoo',
    parentHypothesisId: null,
    universe: {
      id: 'perp-majors-subset',
      symbols: ['BTCUSDT', 'ETHUSDT'],
      weighting: 'equal',
      rebalanceRule: 'none',
    },
    timeframe: '1h',
    horizon: 8,
    features: [{ name: 'funding_rate', lookback: 24, params: {} }],
    transformations: [],
    regimeConstraints: [],
    expectedMechanism:
      'Funding dislocation + OI expansion + liquidation imbalance may indicate crowded positioning and short-horizon reversal',
    expectedDirection: 'long',
    expectedHoldingPeriod: 8,
    costAssumption: 'conservative',
    generatedBy: 'test-generator',
    createdAt: '2026-06-15T12:00:00.000Z',
    experimentVersion: 1,
    ...overrides,
  });
  if (!result.ok) throw new Error(`fixture invalid: ${result.reasons.join('; ')}`);
  return result.value;
}

describe('parseResearchGoal', () => {
  it('accepts a fully valid goal', () => {
    const result = parseResearchGoal(makeGoalInput());
    expect(result.ok).toBe(true);
  });

  it('objective shorter than 10 chars → rejected', () => {
    expect(parseResearchGoal(makeGoalInput({ objective: 'short' })).ok).toBe(false);
  });

  it('empty successCriteria or failureCriteria → rejected', () => {
    expect(parseResearchGoal(makeGoalInput({ successCriteria: [] })).ok).toBe(false);
    expect(parseResearchGoal(makeGoalInput({ failureCriteria: [] })).ok).toBe(false);
  });

  it('empty universe symbols → rejected', () => {
    const universe = { id: 'u', symbols: [], weighting: 'equal', rebalanceRule: 'none' };
    expect(parseResearchGoal(makeGoalInput({ universe })).ok).toBe(false);
  });

  it('non-ISO timePeriod or createdAt → rejected', () => {
    expect(
      parseResearchGoal(
        makeGoalInput({ timePeriod: { start: 'soon', end: '2026-12-31T23:59:59.000Z' } }),
      ).ok,
    ).toBe(false);
    expect(parseResearchGoal(makeGoalInput({ createdAt: 'not-a-date' })).ok).toBe(false);
  });

  it('timePeriod end not after start → rejected', () => {
    const result = parseResearchGoal(
      makeGoalInput({
        timePeriod: { start: '2026-12-31T23:59:59.000Z', end: '2026-01-01T00:00:00.000Z' },
      }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reasons.join(' ')).toContain('timePeriod.end');
  });

  it('missing createdBy → rejected', () => {
    const input = makeGoalInput();
    delete input.createdBy;
    expect(parseResearchGoal(input).ok).toBe(false);
  });

  it('collects multiple reasons at once', () => {
    const result = parseResearchGoal(
      makeGoalInput({ id: '', objective: 'x', successCriteria: [], failureCriteria: [] }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reasons.length).toBeGreaterThanOrEqual(3);
  });
});

describe('bindHypothesisToGoal', () => {
  it('binds when hypothesis symbols ⊆ goal universe and createdAt in period', () => {
    const goal = parseResearchGoal(makeGoalInput());
    if (!goal.ok) throw new Error('fixture invalid');
    const result = bindHypothesisToGoal(goal.value, makeHypothesis());
    expect(result.ok).toBe(true);
  });

  it('rejects universe mismatch (hypothesis symbol outside goal universe)', () => {
    const goal = parseResearchGoal(makeGoalInput());
    if (!goal.ok) throw new Error('fixture invalid');
    const hypothesis = makeHypothesis({
      universe: {
        id: 'other',
        symbols: ['BTCUSDT', 'DOGEUSDT'],
        weighting: 'equal',
        rebalanceRule: 'none',
      },
    });
    const result = bindHypothesisToGoal(goal.value, hypothesis);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reasons.join(' ')).toContain('DOGEUSDT');
      expect(result.reasons.join(' ')).toContain('universe mismatch');
    }
  });

  it('rejects timeframe incompatibility (createdAt outside goal period)', () => {
    const goal = parseResearchGoal(makeGoalInput());
    if (!goal.ok) throw new Error('fixture invalid');
    const hypothesis = makeHypothesis({ createdAt: '2027-03-01T00:00:00.000Z' });
    const result = bindHypothesisToGoal(goal.value, hypothesis);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reasons.join(' ')).toContain('timeframe incompatible');
  });
});

describe('goalBindingSummary', () => {
  it('produces GOAL → HYPOTHESES view with bound and unbound entries', () => {
    const goal = parseResearchGoal(makeGoalInput());
    if (!goal.ok) throw new Error('fixture invalid');
    const bound = makeHypothesis();
    const unbound = makeHypothesis({ id: 'hyp-0002', createdAt: '2027-03-01T00:00:00.000Z' });
    const summary = goalBindingSummary(goal.value, [bound, unbound]);
    expect(summary.goalId).toBe('goal-0001-funding-research');
    expect(summary.boundHypothesisIds).toEqual(['hyp-0001-funding-fade']);
    expect(summary.entries).toHaveLength(2);
    expect(summary.entries[1]?.bound).toBe(false);
    expect(summary.entries[1]?.reasons.length).toBeGreaterThan(0);
  });

  it('is pure and deterministic: repeated calls give identical output', () => {
    const goal = parseResearchGoal(makeGoalInput());
    if (!goal.ok) throw new Error('fixture invalid');
    const hypotheses = [makeHypothesis()];
    const first = goalBindingSummary(goal.value, hypotheses);
    const second = goalBindingSummary(goal.value, hypotheses);
    expect(second).toEqual(first);
    expect(JSON.stringify(second)).toBe(JSON.stringify(first));
  });
});
