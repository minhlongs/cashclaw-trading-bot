import { type ResearchHypothesis, researchHypothesisSchema } from '../hypothesis/types';
import { checkMechanism } from '../hypothesis/mechanism-gate';
import { resolveStressConfig } from '@/tree/alpha/cost-stress';
import { deriveBarrierConfig, derivePeriods, type CompileResult } from './experiment-spec';
import { mapZodErrors } from './compile-stages';
import { buildSpec } from './spec-builder';
import type { CompilerContext } from './compiler-types';
import { extractCausalFeatures } from './compiler-causal';
import { runValidationStages } from './compiler-runner';
export type { CompilerContext } from './compiler-types';

export async function compile(hypothesis: unknown, ctx: CompilerContext): Promise<CompileResult> {
  const zod = researchHypothesisSchema.safeParse(hypothesis);
  if (!zod.success) return { ok: false, reasons: mapZodErrors(zod.error.issues) };
  const h = zod.data as ResearchHypothesis;
  if (!checkMechanism(h.expectedMechanism).ok) return { ok: false, reasons: ['MECHANISM_REJECTED'] };
  const causal = extractCausalFeatures(h);
  if (!causal.ok) return { ok: false, reasons: causal.reasons };
  const val = runValidationStages(h, causal.features, ctx);
  if (!val.ok) return { ok: false, reasons: val.reasons };
  const maxLb = Math.max(...causal.features.map((f) => f.lookback), 0);
  const periods = derivePeriods(ctx.dataWindow, h.horizon, maxLb);
  if (!periods) return { ok: false, reasons: ['INSUFFICIENT_DATA_WINDOW'] };
  return buildSpec(h, causal.features, ctx, resolveStressConfig(h.costAssumption), deriveBarrierConfig(h.horizon, h.timeframe), periods);
}
