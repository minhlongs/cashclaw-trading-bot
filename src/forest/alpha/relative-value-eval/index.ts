// Barrel for relative-value evaluation.

export type {
  RelativeValueEvalConfig,
  RelativeValueEvalInput,
  RelativeValueReport,
  RelativeValueReportOptions,
  RelativeValueResult,
  RelativeValueValidationSummary,
  RoundTripMetrics,
  RVRegimeSubReport,
} from './types';

export { validateEvalInputs } from './evaluate-validate';
export { buildRelativeValueReport, FUNDING_NOTE } from './report';
export { computeRealizedPairBetaSeries } from './realized-beta';
export { evaluateRelativeValue } from './evaluate';
export type { PairRoundTrip, RoundTripExtraction } from './round-trips';
export { extractRoundTrips } from './round-trips';
export * from './walk-forward';
export type { RVAdapterOptions } from './survival-adapter';
export { toEvaluationReport } from './survival-adapter';
export { toWalkForwardShim } from './survival-shim';
export type { SurvivalAssemblyConfig } from './survival-input';
export { assembleSurvivalInput } from './survival-input';
export type {
  BenchmarkComparison,
  BenchmarkComparisonRow,
  BenchmarkOptions,
  OosSpan,
} from './benchmarks';
export { BENCHMARK_STRATEGIES, oosSpan, runBenchmarks } from './benchmarks';
export type {
  RvAblationInput,
  RvAblationResult,
  RvAblationVariant,
  RvComponent,
} from './ablation';
export { RV_COMPONENTS, runRvAblation } from './ablation';
export type {
  RvRobustnessEntry,
  RvRobustnessInput,
  RvRobustnessReport,
} from './robustness';
export {
  ROBUSTNESS_ENTRY_Z,
  ROBUSTNESS_HEDGE_WINDOWS,
  ROBUSTNESS_RUN_COUNT,
  ROBUSTNESS_STRESS_MODES,
  runRvRobustness,
} from './robustness';
