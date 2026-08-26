// AlphaCompiler — deterministic compilation pipeline from ResearchHypothesis to ExperimentSpec.
// Pure logic: no I/O, no network, no eval/exec. Only async is WebCrypto SHA-256 for specId.
// Each stage fail-closed with reason codes. Compiler NEVER executes experiments.

import { canonicalize } from '@/lib/canonical-json';
import type { AlphaProvenance } from './provenance';
import { type ResearchHypothesis, researchHypothesisSchema } from '../hypothesis/types';
import { checkMechanism } from '../hypothesis/mechanism-gate';
import { declareFeature, type FeatureDeclaration } from '@/tree/alpha/indicator-types';
import type { Universe } from '@/tree/alpha/universe/types';
import { RegimeLabel } from '@/tree/regime/types';
import { resolveStressConfig, type StressConfig, type StressMode } from '@/forest/backtest/cost-model';
import type { BarrierConfig } from '@/tree/alpha/labeling';
import {
  deriveBarrierConfig,
  derivePeriods,
  deriveSeedFromSpecId,
  type ExperimentPeriod,
  type ExperimentSpec,
  type CompileResult,
  type DataWindow,
} from './experiment-spec';
import {
  mapZodErrors,
  inferFeatureSource,
  validateFeatures,
  validateDataAndUniverse,
  validateCost,
} from './compile-stages';

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
}

/**
 * Compile a ResearchHypothesis into an ExperimentSpec.
 * Pipeline stages (each fail-closed):
 * 1. Parse hypothesis (Zod + mechanism gate) — Zod field errors → specific codes; mechanism gate → MECHANISM_REJECTED
 * 2. Causal validation: each FeatureRef → declareFeature(causal: true); throw → reject
 * 3. Feature validation: no duplicates; lookbacks finite positive; lookback ≤ dataWindow bars
 * 4. Data/universe validation: universe non-empty; timeframe non-empty; window covers maxLookback + horizon + MIN_TRAIN_BARS
 * 5. Cost validation: costAssumption resolves via resolveStressConfig
 * 6. Emit spec with specId = SHA-256 of canonical JSON (excl seed + compiledAt); seed derived from specId
 */
export async function compile(
  hypothesis: unknown,
  ctx: CompilerContext,
): Promise<CompileResult> {
  // Stage 1a: Zod schema validation (field-level errors → specific codes)
  const zodResult = researchHypothesisSchema.safeParse(hypothesis);
  if (!zodResult.success) {
    const codes = mapZodErrors(zodResult.error.issues);
    return { ok: false, reasons: codes };
  }
  const h = zodResult.data as ResearchHypothesis;

  // Stage 1b: Mechanism gate
  const mechanism = checkMechanism(h.expectedMechanism);
  if (!mechanism.ok) {
    return { ok: false, reasons: ['MECHANISM_REJECTED'] };
  }

  // Stage 2: Causal validation — map each FeatureRef to declareFeature(causal: true)
  const features: FeatureDeclaration[] = [];
  for (const ref of h.features) {
    try {
      const declared = declareFeature({
        name: ref.name,
        timeframe: h.timeframe,
        source: inferFeatureSource(ref.name),
        lookback: ref.lookback,
        availability: 'always',
        causal: true,
      });
      features.push(declared);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes('non-causal') || message.includes('causal flag')) {
        return { ok: false, reasons: ['CAUSAL_REJECTED'] };
      }
      // Other declareFeature errors (invalid name, timeframe, lookback, availability)
      return { ok: false, reasons: ['CAUSAL_REJECTED'] };
    }
  }

  // Stage 3: Feature validation
  const featureValidation = validateFeatures(features, ctx.supportedFeatures, ctx.dataWindow);
  if (!featureValidation.ok) {
    return { ok: false, reasons: featureValidation.reasons };
  }

  // Stage 4: Data/universe validation
  const dataValidation = validateDataAndUniverse(h, features, ctx.dataWindow);
  if (!dataValidation.ok) {
    return { ok: false, reasons: dataValidation.reasons };
  }

  // Stage 5: Cost validation
  const costValidation = validateCost(h.costAssumption);
  if (!costValidation.ok) {
    return { ok: false, reasons: costValidation.reasons };
  }

  // All stages passed — build spec body (without compiledAt for hashing)
  const costConfig = resolveStressConfig(h.costAssumption);
  const barrierConfig = deriveBarrierConfig(h.horizon, h.timeframe);
  const maxLookback = Math.max(...features.map((f) => f.lookback), 0);
  const periods = derivePeriods(ctx.dataWindow, h.horizon, maxLookback);
  if (!periods) {
    return { ok: false, reasons: ['INSUFFICIENT_DATA_WINDOW'] };
  }

  return buildSpec(h, features, ctx, costConfig, barrierConfig, periods);
}

/** Build the final ExperimentSpec from validated inputs (specId + seed + compiledAt). */
async function buildSpec(
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
  const compiledAt = new Date().toISOString();
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
function buildSpecBody(params: {
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
async function hashSpecBody(body: object): Promise<string> {
  const canonical = canonicalize(body);
  const bytes = new TextEncoder().encode(canonical);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}
