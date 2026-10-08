// Hypothesis builder — assembles ResearchHypothesis from debate thesis.
// Pure logic: no I/O, no LLM.

import { canonicalize } from '@/lib/canonical-json';
import type { Universe } from '@/tree/alpha/universe/types';
import type { StressMode } from '@/tree/alpha/cost-stress';
import type {
  ExpectedDirection,
  FeatureRef,
  ResearchHypothesis,
} from '@/tree/research/hypothesis/types';
import { fnv1a32 } from './hypothesis-fnv';

/** One side's debate thesis (bull or bear). */
export interface DebateThesis {
  readonly role: 'bull' | 'bear';
  readonly thesis: string;
  /** Causal mechanism claim — must pass the mechanism gate. */
  readonly mechanism: string;
  readonly evidence: readonly string[];
  readonly expectedDirection: ExpectedDirection;
  readonly horizon: number;
  readonly features: readonly FeatureRef[];
}

/** A bull/bear debate bound to a research goal. */
export interface DebateInput {
  readonly goalId: string;
  readonly bull: DebateThesis;
  readonly bear: DebateThesis;
}

/** Config injected by the caller (no wall clock unless provided). */
export interface HypothesisExtractionConfig {
  readonly universe: Universe;
  readonly timeframe: string;
  readonly nowIso: string;
  readonly importerVersion: string;
  readonly defaultCostMode: StressMode;
}

/** Deterministic hypothesis id from canonical(debateState + role). */
export function buildHypothesisId(goalId: string, thesis: DebateThesis): string {
  const payload = canonicalize({ goalId, role: thesis.role, thesis: thesis.thesis });
  return `delib-${thesis.role}-${fnv1a32(payload).toString(16).padStart(8, '0')}`;
}

/** Assemble one ResearchHypothesis candidate from a debate thesis. */
export function buildHypothesis(
  thesis: DebateThesis,
  debate: DebateInput,
  config: HypothesisExtractionConfig,
): ResearchHypothesis {
  const lookback = thesis.features.length > 0 ? thesis.features[0].lookback : 1;
  return {
    id: buildHypothesisId(debate.goalId, thesis),
    title: `${thesis.role === 'bull' ? 'Bull' : 'Bear'} case: ${thesis.thesis.slice(0, 60)}`,
    description: thesis.thesis,
    rationale: `Debate ${thesis.role} side evidence: ${thesis.evidence.join('; ')}`,
    source: 'deliberation',
    parentHypothesisId: null,
    universe: config.universe,
    timeframe: config.timeframe,
    horizon: thesis.horizon,
    features: thesis.features,
    transformations: [],
    regimeConstraints: [],
    expectedMechanism: thesis.mechanism,
    expectedDirection: thesis.expectedDirection,
    expectedHoldingPeriod: Math.max(thesis.horizon, lookback),
    costAssumption: config.defaultCostMode,
    generatedBy: config.importerVersion,
    createdAt: config.nowIso,
    experimentVersion: 1,
  };
}
