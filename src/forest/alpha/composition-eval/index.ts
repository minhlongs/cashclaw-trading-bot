// Barrel for composition evaluation seam.

export type {
  CompositionEvalConfig,
  CompositionPeriodRecord,
  CompositionEvalResult,
  CompositionWindowBounds,
  CompositionWindowResult,
  CompositionSummaryStats,
  CompositionWalkForwardResult,
  CompositionWalkForwardInput,
} from './types';
export { evaluateComposition } from './evaluate';
export { runCompositionWalkForward } from './walk-forward';
export { toWalkForwardShim } from './walk-forward-shim';

