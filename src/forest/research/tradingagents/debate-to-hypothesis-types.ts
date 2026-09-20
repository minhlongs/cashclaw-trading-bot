// Debate-to-Hypothesis — shared types & config.

import type { ExperimentSpec, DataWindow } from '@/tree/research/alpha/experiment-spec';
import type { ResearchHypothesis } from '@/tree/research/hypothesis/types';
import type { Universe } from '@/tree/alpha/universe/types';
import type { StressMode } from '@/forest/backtest/cost-model';
import type { DecisionProposal } from '@/tree/research/tradingagents/decision-contract';
import type { DebateState } from '@/tree/research/tradingagents/debate-state';
import type { ModelProvenanceRecord, ToolProvenance } from '@/tree/research/tradingagents';
import type { ResearchLineage } from '@/tree/research/evidence/lineage';
import type { DebateOrchestratorConfig } from './debate-orchestrator';
import type { ModelRouter } from './model-router';

/** Result of wiring debate to hypotheses. */
export interface DebateToHypothesisResult {
  readonly hypotheses: readonly ResearchHypothesis[];
  readonly lineage: ResearchLineage;
  readonly experimentSpecs: readonly ExperimentSpec[];
  readonly proposalId: string;
  readonly researchGoalId: string;
  readonly decisionProposal: DecisionProposal;
  readonly debateState: DebateState;
  readonly modelProvenance: readonly ModelProvenanceRecord[];
  readonly toolProvenance: readonly ToolProvenance[];
}

/** Outcome: fail-closed. */
export type DebateToHypothesisOutcome =
  | { readonly ok: true; readonly value: DebateToHypothesisResult }
  | { readonly ok: false; readonly reasons: readonly string[] };

/** Configuration for debate-to-hypothesis wiring. */
export interface DebateToHypothesisConfig {
  readonly orchestratorConfig: DebateOrchestratorConfig;
  readonly router: ModelRouter;
  readonly dataWindow: DataWindow;
  readonly universe: Universe;
  readonly timeframe: string;
  readonly nowIso: string;
  readonly importerVersion: string;
  readonly defaultCostMode: StressMode;
}
