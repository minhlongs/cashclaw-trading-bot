// DeliberationReport tests — Σ≡N invariant (assertNoSilentSkips pattern).
// Totals derivation, bucket sum, tamper detection.

import { describe, expect, it } from 'vitest';
import {
  computeDeliberationTotals,
  sumBuckets,
  assertNoSilentSkips,
  summarizeDeliberationReport,
  type DeliberationReport,
  type StageResult,
} from './report-types';

function makeStage(stage: StageResult['stage'], outcome: StageResult['outcome']): StageResult {
  return { stage, outcome, reasons: [] };
}

function makeReport(stageResults: readonly StageResult[]): DeliberationReport {
  return {
    researchGoalId: 'goal-1',
    proposalId: 'prop-1',
    decisionProposal: {} as DeliberationReport['decisionProposal'],
    debateState: {} as DeliberationReport['debateState'],
    hypotheses: [],
    experimentSpecs: [],
    lineage: {} as DeliberationReport['lineage'],
    riskAdvisory: {} as DeliberationReport['riskAdvisory'],
    portfolioResult: {} as DeliberationReport['portfolioResult'],
    modelProvenance: [],
    toolProvenance: [],
    stageResults,
    totals: computeDeliberationTotals(stageResults),
    createdAt: '2026-08-26T00:00:00.000Z',
  };
}

describe('computeDeliberationTotals', () => {
  it('counts each outcome bucket and total', () => {
    const stages = [
      makeStage('analyst-output', 'completed'),
      makeStage('debate-output', 'completed'),
      makeStage('research-synthesis', 'failed'),
      makeStage('risk-proposal', 'skipped'),
      makeStage('portfolio-proposal', 'rejected'),
    ];
    const totals = computeDeliberationTotals(stages);
    expect(totals.completed).toBe(2);
    expect(totals.failed).toBe(1);
    expect(totals.skipped).toBe(1);
    expect(totals.rejected).toBe(1);
    expect(totals.total).toBe(5);
  });

  it('handles empty stage list', () => {
    const totals = computeDeliberationTotals([]);
    expect(totals.total).toBe(0);
    expect(sumBuckets(totals)).toBe(0);
  });
});

describe('assertNoSilentSkips', () => {
  it('passes when Σ buckets ≡ stage count', () => {
    const stages = [makeStage('analyst-output', 'completed'), makeStage('debate-output', 'failed')];
    const report = makeReport(stages);
    expect(() => assertNoSilentSkips(report, stages.length)).not.toThrow();
  });

  it('throws on tampered totals (bucket sum mismatch)', () => {
    const stages = [makeStage('analyst-output', 'completed')];
    const report = makeReport(stages);
    const tampered: DeliberationReport = {
      ...report,
      totals: { ...report.totals, completed: 5 },
    };
    expect(() => assertNoSilentSkips(tampered, stages.length)).toThrow(/silent-skip/);
  });

  it('throws on tampered total field', () => {
    const stages = [makeStage('analyst-output', 'completed')];
    const report = makeReport(stages);
    const tampered: DeliberationReport = {
      ...report,
      totals: { ...report.totals, total: 99 },
    };
    expect(() => assertNoSilentSkips(tampered, stages.length)).toThrow(/silent-skip/);
  });

  it('throws when stage count does not match results length', () => {
    const stages = [makeStage('analyst-output', 'completed')];
    const report = makeReport(stages);
    expect(() => assertNoSilentSkips(report, 3)).toThrow(/silent-skip/);
  });
});

describe('summarizeDeliberationReport', () => {
  it('produces a one-line summary with all buckets', () => {
    const stages = [makeStage('analyst-output', 'completed'), makeStage('debate-output', 'rejected')];
    const summary = summarizeDeliberationReport(makeReport(stages));
    expect(summary).toContain('2 stages');
    expect(summary).toContain('completed 1');
    expect(summary).toContain('rejected 1');
  });
});
