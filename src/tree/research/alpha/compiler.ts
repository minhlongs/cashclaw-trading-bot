// AlphaCompiler — deterministic compilation pipeline from ResearchHypothesis to ExperimentSpec.
// Pure logic: no I/O, no network, no eval/exec. Only async is WebCrypto SHA-256 for specId.
// Each stage fail-closed with reason codes. Compiler NEVER executes experiments.

import type { AlphaProvenance } from './provenance';
import { type ResearchHypothesis, researchHypothesisSchema } from '../hypothesis/types';
import { checkMechanism } from '../hypothesis/mechanism-gate';
import { declareFeature, type FeatureDeclaration } from '@/tree/alpha/indicator-types';
import { resolveStressConfig } from '@/tree/alpha/cost-stress';
import {
  deriveBarrierConfig,
  derivePeriods,
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
import { buildSpec } from './spec-builder';

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
