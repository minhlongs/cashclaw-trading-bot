import type { ResearchHypothesis } from '../hypothesis/types';
import { declareFeature, type FeatureDeclaration } from '@/tree/alpha/indicator-types';
import { inferFeatureSource } from './compile-stages';
import type { CompileFailureCode } from './experiment-spec';

export function extractCausalFeatures(h: ResearchHypothesis): { ok: true; features: FeatureDeclaration[] } | { ok: false; reasons: readonly CompileFailureCode[] } {
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
    } catch {
      return { ok: false, reasons: ['CAUSAL_REJECTED'] };
    }
  }
  return { ok: true, features };
}
