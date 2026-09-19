// Deliberation runner types — RunDeliberationConfig, RunDeliberationResult.

import type { ModelRouter } from './model-router';
import type { DeliberationReport } from './report-types';
import type { ResearchGoal } from '@/tree/research/goals/types';
import type { DataWindow } from '@/tree/research/alpha/experiment-spec';
import type { Universe } from '@/tree/alpha/universe/types';
import type { StressMode } from '@/forest/backtest/cost-model';
import type { PortfolioConfig, RiskInputs } from '@/tree/alpha/portfolio/types';
import type { ComposedAlpha } from '@/tree/alpha/composition/types';

/** Configuration for the full deliberation run. */
export interface RunDeliberationConfig {
  readonly router: ModelRouter;
  readonly researchGoal: ResearchGoal;
  readonly proposalId: string;
  readonly nowIso: string;
  readonly maxDebateRounds: number;
  readonly dataWindow: DataWindow;
  readonly universe: Universe;
  readonly timeframe: string;
  readonly importerVersion: string;
  readonly defaultCostMode: StressMode;
  readonly portfolioConfig: PortfolioConfig;
  readonly riskInputs: RiskInputs;
  readonly currentWeights: ReadonlyMap<string, number>;
  readonly composedAlphas: readonly ComposedAlpha[];
  /** Optional decision log JSON to continue from (for replay/resume). */
  readonly initialDecisionLog?: string;
}

/** Deliberation run outcome. */
export type RunDeliberationResult =
  | { readonly ok: true; readonly report: DeliberationReport; readonly decisionLog: string }
  | { readonly ok: false; readonly reasons: readonly string[] };
