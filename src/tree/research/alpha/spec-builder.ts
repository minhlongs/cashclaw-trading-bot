// AlphaCompiler — spec construction helpers.
// Pure logic: no I/O, no network, no eval/exec. Only async is WebCrypto SHA-256 for specId.
// Extracted from compiler.ts to keep the orchestrator file focused on the compile pipeline.

import { canonicalize } from '@/lib/canonical-json';
import { type ResearchHypothesis } from '../hypothesis/types';
import type { FeatureDeclaration } from '@/tree/alpha/indicator-types';
import type { Universe } from '@/tree/alpha/universe/types';
import { RegimeLabel } from '@/tree/regime/types';
import type { StressMode, StressConfig } from '@/tree/alpha/cost-stress';
import type { BarrierConfig } from '@/tree/alpha/labeling';
import type { AlphaProvenance } from './provenance';
import {
  type ExperimentPeriod,
  type ExperimentSpec,
  type CompileResult,
  type DataWindow,
  deriveSeedFromSpecId,
} from './experiment-spec';

/** Context supplied to compiler (caller provides data window + optional goal/provenance). */
export interface CompilerContext {
  /** Available data window — caller MUST supply; compiler does NOT fetch data. */
  readonly dataWindow: DataWindow;
  /** Optional goal ID to bind (validates universe overlap if provided). */
  readonly goalId?: string | null;
  /** Optional provenance if hypothesis was imported. */
  readonly provenance?: AlphaProvenance | null;
  /** Allowlist of supported feature names (from caller's indicator registry). */
  readonly supportedFeatures?: readonly string[];
  /** Optional deterministic timestamp override (ISO string). Preserves replay
   *  determinism when the caller supplies a fixed clock instead of `new Date()`. */
  readonly nowIso?: string;
}

/** Build the final ExperimentSpec from validated inputs (specId + seed + compiledAt). */
export async function buildSpec(
  h: ResearchHypothesis,
  features: readonly FeatureDeclaration[],
  ctx: CompilerContext,
  costConfig: StressConfig,
  barrierConfig: BarrierConfig,
  periods: { train: ExperimentPeriod; validation: ExperimentPeriod; test: ExperimentPeriod },
): Promise<CompileResult> {
  const specBody = buildSpecBody({
    hypothesisId: h.id, goalId: ctx.goalId ?? null,
    universe: h.universe, timeframe: h.timeframe, horizonBars: h.horizon,
    features,
    transformations: h.transformations, regimeConstraints: h.regimeConstraints,
    expectedDirection: h.expectedDirection, costMode: h.costAssumption,
    costConfig, barrierConfig,
    trainPeriod: periods.train, validationPeriod: periods.validation, testPeriod: periods.test,
    provenance: ctx.provenance ?? null,
  });

  // Compute specId from specBody (excl seed + compiledAt), then derive seed from specId
  const specId = await hashSpecBody(specBody);
  const seed = deriveSeedFromSpecId(specId);

  // Final spec with specId, seed, and compiledAt
  const compiledAt = ctx.nowIso ?? new Date().toISOString();
  const spec: ExperimentSpec = {
    ...specBody,
    specId,
    seed,
    compiledAt,
    compilerVersion: 1,
  };

  return { ok: true, value: spec };
}

/** Build the spec body (without specId, seed, compiledAt for hashing). */
export function buildSpecBody(params: {
  hypothesisId: string;
  goalId: string | null;
  universe: Universe;
  timeframe: string;
  horizonBars: number;
  features: readonly FeatureDeclaration[];
  transformations: readonly string[];
  regimeConstraints: readonly RegimeLabel[];
  expectedDirection: 'long' | 'short' | 'neutral';
  costMode: StressMode;
  costConfig: StressConfig;
  barrierConfig: BarrierConfig;
  trainPeriod: ExperimentPeriod;
  validationPeriod: ExperimentPeriod;
  testPeriod: ExperimentPeriod;
  provenance: AlphaProvenance | null;
}): Omit<ExperimentSpec, 'specId' | 'seed' | 'compiledAt' | 'compilerVersion'> {
  return {
    hypothesisId: params.hypothesisId, goalId: params.goalId,
    universe: params.universe, timeframe: params.timeframe, horizonBars: params.horizonBars,
    features: params.features,
    transformations: params.transformations, regimeConstraints: params.regimeConstraints,
    expectedDirection: params.expectedDirection, costMode: params.costMode,
    costConfig: params.costConfig, barrierConfig: params.barrierConfig,
    trainPeriod: params.trainPeriod, validationPeriod: params.validationPeriod, testPeriod: params.testPeriod,
    provenance: params.provenance,
  };
}

/** Hash the spec body using WebCrypto SHA-256. */
export async function hashSpecBody(body: object): Promise<string> {
  const canonical = canonicalize(body);
  const bytes = new TextEncoder().encode(canonical);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}
