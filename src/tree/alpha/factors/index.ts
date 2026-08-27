export { computeFactorExposure, multiFactorAnalysis, rankFactorsByExposure } from './analysis';
export type { Factor, FactorExposure, FactorAnalysisResult } from './types';
export {
  buildForwardReturnSeries,
  materializeVwap,
  validateAlignedPanels,
  validateSymbolPanel,
} from './panel';
export type { ForwardReturnSeries, SymbolPanel } from './panel';
export {
  averageTieRanks,
  icInformationRatio,
  meanStd,
  pearson,
  regimeIcBreakdown,
  signConsistencyStability,
  spearman,
} from './ic-metrics';
export type { RegimeIcSummary } from './ic-metrics';
export { analyzeIc } from './ic-analysis';
export type {
  IcAnalysisConfig,
  IcAnalysisResult,
  IcPoint,
  QuantileSpreadPoint,
} from './ic-analysis';
export { rebalancePoint, topBucketWeights, turnoverSeries } from './ic-quantile';
export type { ScorePair } from './ic-quantile';
