// Debate-to-Hypothesis — compiler & extraction payload builders.

import { compile, type CompilerContext } from '@/tree/research/alpha/compiler';
import type { ExperimentSpec } from '@/tree/research/alpha/experiment-spec';
import type { ResearchHypothesis } from '@/tree/research/hypothesis/types';
import type { DebateInput } from '@/tree/research/tradingagents/hypothesis-extraction';
import type { DebateSide } from './debate-orchestrator';

/** Build DebateInput structure from orchestrator bull/bear sides. */
export function buildDebateInput(
  goalId: string,
  bull: DebateSide,
  bear: DebateSide,
): DebateInput {
  return {
    goalId,
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
}

/**
 * Compile each hypothesis → ExperimentSpec.
 * Returns compiled specs plus per-hypothesis failure reasons.
 */
export async function compileDebateHypotheses(
  hypotheses: readonly ResearchHypothesis[],
  compilerContext: CompilerContext,
): Promise<{ readonly specs: ExperimentSpec[]; readonly reasons: string[] }> {
  const reasons: string[] = [];
  const specs: ExperimentSpec[] = [];
  for (const h of hypotheses) {
    const compileResult = await compile(h, compilerContext);
    if (!compileResult.ok) {
      reasons.push(...compileResult.reasons.map((r) => `compile(${h.id}): ${r}`));
      continue;
    }
    specs.push(compileResult.value);
  }
  return { specs, reasons };
}
