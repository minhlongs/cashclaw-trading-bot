// AlphaCompiler — deterministic compilation pipeline from ResearchHypothesis to ExperimentSpec.
// Pure logic: no I/O, no network, no eval/exec. Only async is WebCrypto SHA-256 for specId.
// Each stage fail-closed with reason codes. Compiler NEVER executes experiments.

import { canonicalize } from '@/lib/canonical-json';
import { z } from 'zod';
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
  MIN_TRAIN_BARS,
  type ExperimentSpec,
  type CompileResult,
  type CompileFailureCode,
  type DataWindow,
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
}

/**
 * Compile a ResearchHypothesis into an ExperimentSpec.
 * Pipeline stages (each fail-closed):
 * 1. Parse hypothesis (Zod + mechanism gate) — Zod field errors → specific codes; mechanism gate → MECHANISM_REJECTED
 * 2. Causal validation: each FeatureRef → declareFeature(causal: true); throw → reject
 * 3. Feature validation: no duplicates; lookbacks finite positive; lookback ≤ dataWindow bars
 * 4. Data/universe validation: universe non-empty; timeframe non-empty; window covers maxLookback + horizon + MIN_TRAIN_BARS
 * 5. Cost validation: costAssumption resolves via resolveStressConfig
 * 6. Emit spec with specId = SHA-256 of canonical JSON (excl compiledAt)
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
  periods: { train: { startTimestamp: number; endTimestamp: number; barCount: number }; validation: { startTimestamp: number; endTimestamp: number; barCount: number }; test: { startTimestamp: number; endTimestamp: number; barCount: number } },
): Promise<CompileResult> {
  const seed = deriveSeedFromSpecId(''); // temporary, will recompute after specId
  const specBody = buildSpecBody({
    hypothesisId: h.id,
    goalId: ctx.goalId ?? null,
    universe: h.universe,
    timeframe: h.timeframe,
    horizonBars: h.horizon,
    features,
    transformations: h.transformations,
    regimeConstraints: h.regimeConstraints,
    expectedDirection: h.expectedDirection,
    costMode: h.costAssumption,
    costConfig,
    barrierConfig,
    trainPeriod: periods.train,
    validationPeriod: periods.validation,
    testPeriod: periods.test,
    seed, // placeholder
    provenance: ctx.provenance ?? null,
  });

  // Compute specId from specBody (excl compiledAt)
  const specId = await hashSpecBody(specBody);
  const finalSeed = deriveSeedFromSpecId(specId);

  // Final spec with specId, finalSeed, and compiledAt
  const compiledAt = new Date().toISOString();
  const spec: ExperimentSpec = {
    ...specBody,
    specId,
    seed: finalSeed,
    compiledAt,
    compilerVersion: 1,
  };

  return { ok: true, value: spec };
}

/** Build the spec body (without specId, compiledAt for hashing). */
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
  trainPeriod: { readonly startTimestamp: number; readonly endTimestamp: number; readonly barCount: number };
  validationPeriod: { readonly startTimestamp: number; readonly endTimestamp: number; readonly barCount: number };
  testPeriod: { readonly startTimestamp: number; readonly endTimestamp: number; readonly barCount: number };
  seed: number;
  provenance: AlphaProvenance | null;
}): Omit<ExperimentSpec, 'specId' | 'compiledAt' | 'compilerVersion'> {
  return {
    hypothesisId: params.hypothesisId,
    goalId: params.goalId,
    universe: params.universe,
    timeframe: params.timeframe,
    horizonBars: params.horizonBars,
    features: params.features,
    transformations: params.transformations,
    regimeConstraints: params.regimeConstraints,
    expectedDirection: params.expectedDirection,
    costMode: params.costMode,
    costConfig: params.costConfig,
    barrierConfig: params.barrierConfig,
    trainPeriod: params.trainPeriod,
    validationPeriod: params.validationPeriod,
    testPeriod: params.testPeriod,
    seed: params.seed,
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

/** Map Zod validation errors to CompileFailureCode. */
function mapZodErrors(issues: readonly z.ZodIssue[]): CompileFailureCode[] {
  return issues.map((issue) => {
    const path = issue.path.join('.');
    if (path === 'expectedMechanism') {
      if (issue.code === 'too_small') return 'MECHANISM_REJECTED';
      return 'MECHANISM_REJECTED';
    }
    if (path === 'universe.symbols' || path === 'universe') return 'EMPTY_UNIVERSE';
    if (path === 'timeframe') return 'EMPTY_TIMEFRAME';
    if (path === 'costAssumption') return 'INVALID_COST_MODE';
    if (path.startsWith('features') && issue.code === 'too_small') return 'INVALID_LOOKBACK';
    return 'INTERNAL_ERROR';
  }) as CompileFailureCode[];
}

/** Keyword → FeatureSource mapping for name-based inference. */
const SOURCE_KEYWORDS: ReadonlyArray<{ readonly source: FeatureDeclaration['source']; readonly keywords: readonly string[] }> = [
  { source: 'derivatives', keywords: ['funding', 'oi', 'open_interest', 'liquidation', 'basis'] },
  { source: 'orderbook', keywords: ['spread', 'depth', 'imbalance', 'orderbook'] },
  { source: 'trades', keywords: ['trade', 'volume_delta', 'tape'] },
  { source: 'synthetic', keywords: ['synthetic', 'computed', 'derived'] },
];

/** Infer FeatureSource from feature name heuristic (can be extended). */
function inferFeatureSource(name: string): FeatureDeclaration['source'] {
  const n = name.toLowerCase();
  for (const entry of SOURCE_KEYWORDS) {
    if (entry.keywords.some((kw) => n.includes(kw))) {
      return entry.source;
    }
  }
  return 'ohlcv';
}

/** Validate features: duplicates, lookbacks, supported allowlist, window coverage. */
function validateFeatures(
  features: readonly FeatureDeclaration[],
  supportedFeatures: readonly string[] | undefined,
  dataWindow: DataWindow,
): { ok: true } | { ok: false; reasons: readonly CompileFailureCode[] } {
  const reasons: CompileFailureCode[] = [];

  // No duplicate names
  const names = new Set<string>();
  for (const f of features) {
    if (names.has(f.name)) {
      reasons.push('DUPLICATE_FEATURE');
    }
    names.add(f.name);
  }

  // Lookbacks finite positive
  for (const f of features) {
    if (f.lookback <= 0 || !Number.isFinite(f.lookback)) {
      reasons.push('INVALID_LOOKBACK');
    }
    if (f.lookback > dataWindow.barCount) {
      reasons.push('LOOKBACK_EXCEEDS_WINDOW');
    }
  }

  // Supported features allowlist (if provided)
  if (supportedFeatures && supportedFeatures.length > 0) {
    const allowed = new Set(supportedFeatures);
    for (const f of features) {
      if (!allowed.has(f.name)) {
        reasons.push('UNSUPPORTED_FEATURE');
      }
    }
  }

  if (reasons.length > 0) return { ok: false, reasons };
  return { ok: true };
}

/** Validate universe, timeframe, and data window coverage. */
function validateDataAndUniverse(
  h: ResearchHypothesis,
  features: readonly FeatureDeclaration[],
  dataWindow: DataWindow,
): { ok: true } | { ok: false; reasons: readonly CompileFailureCode[] } {
  const reasons: CompileFailureCode[] = [];

  if (!h.universe || h.universe.symbols.length === 0) {
    reasons.push('EMPTY_UNIVERSE');
  }

  if (!h.timeframe || h.timeframe.trim() === '') {
    reasons.push('EMPTY_TIMEFRAME');
  }

  const maxLookback = Math.max(...features.map((f) => f.lookback), 0);
  const requiredBars = maxLookback + h.horizon + MIN_TRAIN_BARS;
  if (dataWindow.barCount < requiredBars) {
    reasons.push('INSUFFICIENT_DATA_WINDOW');
  }

  if (reasons.length > 0) return { ok: false, reasons };
  return { ok: true };
}

/** Validate cost assumption resolves to a valid StressConfig. */
function validateCost(costAssumption: StressMode): { ok: true } | { ok: false; reasons: readonly CompileFailureCode[] } {
  try {
    resolveStressConfig(costAssumption);
    return { ok: true };
  } catch {
    return { ok: false, reasons: ['INVALID_COST_MODE'] };
  }
}