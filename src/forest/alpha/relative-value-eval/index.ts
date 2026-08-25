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
