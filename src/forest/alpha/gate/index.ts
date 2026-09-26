/**
 * Alpha Research OS Phase 9: Promotion Gate Module.
 * Public barrel exporting domain types, validation schemas,
 * individual 15-point check evaluators, and the conjunctive promotion gate engine.
 */

export type {
  GateCheckName,
  GateCheck,
  PromotionGateConfig,
  RegimePerformance,
  FinancialMetricsInput,
  StressMetricsInput,
  CandidateBaselineMetrics,
  BenchmarkMetrics,
  ReproducibleHashDetails,
  RobustnessMetricsInput,
  PromotionGateInput,
  PromotionGateResult,
} from './types';

export { DEFAULT_PROMOTION_GATE_CONFIG } from './types';

export {
  GateCheckNameSchema,
  GateCheckSchema,
  PromotionGateConfigSchema,
  RegimePerformanceSchema,
  FinancialMetricsInputSchema,
  StressMetricsInputSchema,
  CandidateBaselineMetricsSchema,
  BenchmarkMetricsSchema,
  ReproducibleHashDetailsSchema,
  RobustnessMetricsInputSchema,
  PromotionGateInputSchema,
  PromotionGateResultSchema,
} from './schemas';

export {
  checkMinTrades,
  checkMinNetExpectancy,
  checkMinProfitFactor,
  checkMaxDrawdown,
  checkMinSharpeSortino,
  checkMinRegimeCoverage,
} from './financial-checks';

export {
  checkFeeStress,
  checkSlippageStress,
} from './stress-checks';

export {
  checkParameterRobustness,
  checkCrossPeriodRobustness,
  checkCrossAssetRobustness,
  checkLeakageInvariance,
  checkNoSingleWindowDependency,
  checkBaselineComparison,
  checkReproducibleHash,
} from './robustness-checks';

export { runPromotionGate } from './promotion-gate';
