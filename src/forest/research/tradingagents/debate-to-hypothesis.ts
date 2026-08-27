// Debate-to-Hypothesis — wires the tree-layer hypothesis-extractor into
// buildLineage + compile → ExperimentSpec. Deterministic IDs (FNV-1a32).
// No winner selection: bull→A, bear→B, both proceed to evidence-based testing.

import type { ModelRouter } from './model-router';
import type { DebateOrchestratorConfig } from './debate-orchestrator';
import type { ResearchHypothesis } from '@/tree/research/hypothesis/types';
import type { ExperimentSpec, DataWindow } from '@/tree/research/alpha/experiment-spec';
import type { Universe } from '@/tree/alpha/universe/types';
import type { StressMode } from '@/forest/backtest/cost-model';
import type { DecisionProposal } from '@/tree/research/tradingagents/decision-contract';
import type { DebateState } from '@/tree/research/tradingagents/debate-state';
import type { ModelProvenanceRecord, ToolProvenance } from '@/tree/research/tradingagents';
import { extractHypotheses, type DebateInput, type HypothesisExtractionConfig } from '@/tree/research/tradingagents/hypothesis-extraction';
import { buildLineage, type ResearchLineage } from '@/tree/research/evidence/lineage';
import { compile, type CompilerContext } from '@/tree/research/alpha/compiler';

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

/**
 * Wire the debate orchestrator output into CashClaw's hypothesis pipeline.
 * 1. Run orchestrator → DecisionProposal + DebateState
 * 2. Extract bull→A + bear→B hypotheses (via hypothesis-extractor)
 * 3. Build lineage
 * 4. Compile each hypothesis → ExperimentSpec
 */
export async function debateToHypothesis(
  config: DebateToHypothesisConfig,
): Promise<DebateToHypothesisOutcome> {
  const reasons: string[] = [];

  // Step 1: Run orchestrator
  const { runDebateOrchestrator } = await import('./debate-orchestrator');
  const orchestratorResult = await runDebateOrchestrator({
    ...config.orchestratorConfig,
    router: config.router,
  });

  if (!orchestratorResult.ok) {
    return { ok: false, reasons: orchestratorResult.reasons };
  }

  const { decisionProposal, debateState, bull, bear } = orchestratorResult.value;

  // Step 2: Extract hypotheses
  const extractionConfig: HypothesisExtractionConfig = {
    universe: config.universe,
    timeframe: config.timeframe,
    nowIso: config.nowIso,
    importerVersion: config.importerVersion,
    defaultCostMode: config.defaultCostMode,
  };

  const debateInput: DebateInput = {
    goalId: config.orchestratorConfig.researchGoalId,
    bull: {
      role: 'bull',
      thesis: bull.thesis,
      mechanism: bull.mechanism,
      evidence: bull.evidence,
      expectedDirection: bull.expectedDirection,
      horizon: bull.horizon,
      features: bull.features.map((name) => ({ name, lookback: bull.horizon, params: {} })),
    },
    bear: {
      role: 'bear',
      thesis: bear.thesis,
      mechanism: bear.mechanism,
      evidence: bear.evidence,
      expectedDirection: bear.expectedDirection,
      horizon: bear.horizon,
      features: bear.features.map((name) => ({ name, lookback: bear.horizon, params: {} })),
    },
  };

  const extractionResult = extractHypotheses(debateInput, extractionConfig);
  if (!extractionResult.ok) {
    return { ok: false, reasons: extractionResult.reasons };
  }

  const hypotheses = [extractionResult.value.hypothesisA, extractionResult.value.hypothesisB];

  // Step 3: Build lineage
  let lineage: ResearchLineage;
  try {
    lineage = buildLineage(hypotheses);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return { ok: false, reasons: [`lineage build failed: ${message}`] };
  }

  // Step 4: Compile each hypothesis → ExperimentSpec
  const compilerContext: CompilerContext = {
    dataWindow: config.dataWindow,
    goalId: config.orchestratorConfig.researchGoalId,
    provenance: null,
    nowIso: config.nowIso,
  };

  const experimentSpecs: ExperimentSpec[] = [];
  for (const h of hypotheses) {
    const compileResult = await compile(h, compilerContext);
    if (!compileResult.ok) {
      reasons.push(...compileResult.reasons.map((r) => `compile(${h.id}): ${r}`));
      continue;
    }
    experimentSpecs.push(compileResult.value);
  }

  if (reasons.length > 0) {
    return { ok: false, reasons };
  }

  return {
    ok: true,
    value: {
      hypotheses,
      lineage,
      experimentSpecs,
      proposalId: config.orchestratorConfig.proposalId,
      researchGoalId: config.orchestratorConfig.researchGoalId,
      decisionProposal,
      debateState,
      modelProvenance: orchestratorResult.value.modelProvenance,
      toolProvenance: orchestratorResult.value.toolProvenance,
    },
  };
}