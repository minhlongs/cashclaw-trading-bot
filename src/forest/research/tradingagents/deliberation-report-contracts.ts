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

export const STAGE_OUTCOMES = [
  'completed',
  'failed',
  'skipped',
  'rejected',
] as const;
export type StageOutcome = (typeof STAGE_OUTCOMES)[number];

export interface StageResult {
  readonly stage: DeliberationStage;
  readonly outcome: StageOutcome;
  readonly reasons: readonly string[];
}

export interface DeliberationTotals {
  readonly completed: number;
  readonly failed: number;
  readonly skipped: number;
  readonly rejected: number;
  readonly total: number;
}
