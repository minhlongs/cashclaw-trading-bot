import type { ResearchHypothesis } from '../hypothesis/types';
import type { FeatureDeclaration } from '@/tree/alpha/indicator-types';
import type { CompilerContext } from './compiler-types';
import type { CompileFailureCode } from './experiment-spec';
import { validateFeatures, validateDataAndUniverse, validateCost } from './compile-stages';

export function runValidationStages(h: ResearchHypothesis, features: FeatureDeclaration[], ctx: CompilerContext): { ok: true } | { ok: false; reasons: readonly CompileFailureCode[] } {
  const fVal = validateFeatures(features, ctx.supportedFeatures, ctx.dataWindow);
  if (!fVal.ok) return { ok: false, reasons: fVal.reasons };
  const dVal = validateDataAndUniverse(h, features, ctx.dataWindow);
  if (!dVal.ok) return { ok: false, reasons: dVal.reasons };
  const cVal = validateCost(h.costAssumption);
  if (!cVal.ok) return { ok: false, reasons: cVal.reasons };
  return { ok: true };
}
