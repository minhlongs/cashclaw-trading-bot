// DeliberationReport — fail-closed report for one deliberation run.
// Every deliberation stage lands in EXACTLY ONE bucket; the Σ-buckets ≡
// stage-count invariant is enforced by assertNoSilentSkips (mirrors the
// AlphaImportReport pattern from src/tree/research/alpha/zoo/import-report.ts).
// Pure module: no I/O.

import type { DecisionProposal } from '@/tree/research/tradingagents/decision-contract';
import type { DebateState } from '@/tree/research/tradingagents/debate-state';
import type { ModelProvenanceRecord, ToolProvenance } from '@/tree/research/tradingagents';
import type { ResearchHypothesis } from '@/tree/research/hypothesis/types';
import type { ExperimentSpec } from '@/tree/research/alpha/experiment-spec';
import type { ResearchLineage } from '@/tree/research/evidence/lineage';
import type { RiskAdvisorySet } from './risk-advisor';
import type { PortfolioAdvisorResult } from './portfolio-advisor';

/** Every recordable stage of one deliberation run. */
export const DELIBERATION_STAGES = [
  'analyst-output',
  'debate-output',
  'research-synthesis',
  'risk-proposal',
  'portfolio-proposal',
  'cashclaw-validation',
  'human-decision',
] as const;
export type DeliberationStage = (typeof DELIBERATION_STAGES)[number];

/** Per-stage outcome classification. */
export const STAGE_OUTCOMES = [
  'completed',
  'failed',
  'skipped',
  'rejected',
] as const;
export type StageOutcome = (typeof STAGE_OUTCOMES)[number];

/** One stage result in the deliberation report. */
export interface StageResult {
  readonly stage: DeliberationStage;
  readonly outcome: StageOutcome;
  readonly reasons: readonly string[];
}

/** Bucket counters — one per outcome plus the stage total. */
export interface DeliberationTotals {
  readonly completed: number;
  readonly failed: number;
  readonly skipped: number;
  readonly rejected: number;
  readonly total: number;
}

/** Full deliberation report. */
export interface DeliberationReport {
  readonly researchGoalId: string;
  readonly proposalId: string;
  readonly decisionProposal: DecisionProposal;
  readonly debateState: DebateState;
  readonly hypotheses: readonly ResearchHypothesis[];
  readonly experimentSpecs: readonly ExperimentSpec[];
  readonly lineage: ResearchLineage;
  readonly riskAdvisory: RiskAdvisorySet;
  readonly portfolioResult: PortfolioAdvisorResult;
  readonly modelProvenance: readonly ModelProvenanceRecord[];
  readonly toolProvenance: readonly ToolProvenance[];
  readonly stageResults: readonly StageResult[];
  readonly totals: DeliberationTotals;
  readonly createdAt: string;
}

const TOTAL_KEYS: ReadonlyArray<readonly [StageOutcome, keyof DeliberationTotals]> = [
  ['completed', 'completed'],
  ['failed', 'failed'],
  ['skipped', 'skipped'],
  ['rejected', 'rejected'],
];

/** Derive bucket counters from per-stage results (total = results.length). */
export function computeDeliberationTotals(results: readonly StageResult[]): DeliberationTotals {
  const totals: DeliberationTotals = {
    completed: 0,
    failed: 0,
    skipped: 0,
    rejected: 0,
    total: results.length,
  };
  const mutable = totals as Record<keyof DeliberationTotals, number>;
  for (const result of results) {
    const key = TOTAL_KEYS.find(([outcome]) => outcome === result.outcome);
    if (key !== undefined) mutable[key[1]] += 1;
  }
  return totals;
}

/** Sum the 4 bucket counters (excludes the `total` field). */
export function sumBuckets(totals: DeliberationTotals): number {
  return TOTAL_KEYS.reduce((sum, [, key]) => sum + totals[key], 0);
}

/**
 * Fail-closed invariant: Σ 4 buckets === stageCount AND totals.total ===
 * stageCount. Throws on any mismatch — a silent skip is a bug, never a
 * warning. Called inside run-deliberation before every report is returned.
 */
export function assertNoSilentSkips(report: DeliberationReport, stageCount: number): void {
  const bucketSum = sumBuckets(report.totals);
  if (bucketSum !== stageCount) {
    throw new Error(
      `DeliberationReport silent-skip detected: bucket sum ${bucketSum} !== stage count ${stageCount}`,
    );
  }
  if (report.totals.total !== stageCount) {
    throw new Error(
      `DeliberationReport silent-skip detected: totals.total ${report.totals.total} !== stage count ${stageCount}`,
    );
  }
}

/** Human-readable one-line summary of a report. */
export function summarizeDeliberationReport(report: DeliberationReport): string {
  const t = report.totals;
  return (
    `DeliberationReport: ${t.total} stages — completed ${t.completed}, failed ${t.failed}, ` +
    `skipped ${t.skipped}, rejected ${t.rejected}`
  );
}
