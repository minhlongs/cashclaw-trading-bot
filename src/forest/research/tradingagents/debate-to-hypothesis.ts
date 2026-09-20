// Debate-to-Hypothesis — wires the tree-layer hypothesis-extractor into
// buildLineage + compile → ExperimentSpec. Deterministic IDs (FNV-1a32).
// No winner selection: bull→A, bear→B, both proceed to evidence-based testing.

import { extractHypotheses, type HypothesisExtractionConfig } from '@/tree/research/tradingagents/hypothesis-extraction';
import { buildLineage } from '@/tree/research/evidence/lineage';
import type { CompilerContext } from '@/tree/research/alpha/compiler';
import { buildDebateInput, compileDebateHypotheses } from './debate-to-hypothesis-compile';
import type {
  DebateToHypothesisOutcome,
  DebateToHypothesisConfig,
} from './debate-to-hypothesis-types';

export type {
  DebateToHypothesisResult,
  DebateToHypothesisOutcome,
  DebateToHypothesisConfig,
} from './debate-to-hypothesis-types';

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
  const { runDebateOrchestrator } = await import('./debate-orchestrator');
  const orchestratorResult = await runDebateOrchestrator({
    ...config.orchestratorConfig,
    router: config.router,
  });

  if (!orchestratorResult.ok) {
    return { ok: false, reasons: orchestratorResult.reasons };
  }

  const { decisionProposal, debateState, bull, bear } = orchestratorResult.value;

  const extractionConfig: HypothesisExtractionConfig = {
    universe: config.universe,
    timeframe: config.timeframe,
    nowIso: config.nowIso,
    importerVersion: config.importerVersion,
    defaultCostMode: config.defaultCostMode,
  };

  const debateInput = buildDebateInput(config.orchestratorConfig.researchGoalId, bull, bear);
  const extractionResult = extractHypotheses(debateInput, extractionConfig);
  if (!extractionResult.ok) {
    return { ok: false, reasons: extractionResult.reasons };
  }

  const hypotheses = [extractionResult.value.hypothesisA, extractionResult.value.hypothesisB];

  let lineage: ReturnType<typeof buildLineage>;
  try {
    lineage = buildLineage(hypotheses);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return { ok: false, reasons: [`lineage build failed: ${message}`] };
  }

  const compilerContext: CompilerContext = {
    dataWindow: config.dataWindow,
    goalId: config.orchestratorConfig.researchGoalId,
    provenance: null,
    nowIso: config.nowIso,
  };

  const compileResult = await compileDebateHypotheses(hypotheses, compilerContext);
  if (compileResult.reasons.length > 0) {
    return { ok: false, reasons: compileResult.reasons };
  }

  return {
    ok: true,
    value: {
      hypotheses,
      lineage,
      experimentSpecs: compileResult.specs,
      proposalId: config.orchestratorConfig.proposalId,
      researchGoalId: config.orchestratorConfig.researchGoalId,
      decisionProposal,
      debateState,
      modelProvenance: orchestratorResult.value.modelProvenance,
      toolProvenance: orchestratorResult.value.toolProvenance,
    },
  };
}
