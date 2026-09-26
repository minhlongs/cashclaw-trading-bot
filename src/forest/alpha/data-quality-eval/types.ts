/**
 * Forest Alpha Data Quality Evaluation Seam Types.
 * Composes Tree-layer data quality domain types with evaluation reports,
 * strict schemas, and fail-closed signal generation fence contracts.
 */

import type {
  AlignmentConfig,
  Candle,
  CheckResult,
  DataQualityConfig,
  FutureDataConfig,
  MissingIntervalsConfig,
  OutageConfig,
  QualityDimension,
  QualityStatus,
  QualityViolation,
  StalenessConfig,
  ValidationResult,
  VolumeConfig,
} from '@/tree/alpha/data-quality';

export type {
  AlignmentConfig,
  Candle,
  CheckResult,
  DataQualityConfig,
  FutureDataConfig,
  MissingIntervalsConfig,
  OutageConfig,
  QualityDimension,
  QualityStatus,
  QualityViolation,
  StalenessConfig,
  ValidationResult,
  VolumeConfig,
};

/**
 * Input payload for data quality evaluation seam.
 */
export interface DataQualityEvalInput {
  readonly series: readonly Candle[];
  readonly symbol: string;
  readonly timeframe: string;
  readonly asOf?: number;
  readonly secondarySeries?: readonly Candle[];
}

/**
 * Configuration options for data quality evaluation seam.
 */
export interface DataQualityEvalConfig extends DataQualityConfig {
  readonly reportTitle?: string;
  readonly generatedAt?: number;
}

/**
 * Aggregated summary metrics for check results.
 */
export interface DataQualitySummary {
  readonly totalChecks: number;
  readonly passedChecks: number;
  readonly failedChecks: number;
  readonly violationCount: number;
}

/**
 * Structured diagnostic assessment report produced by evaluation seam.
 */
export interface DataQualityAssessmentReport {
  readonly status: QualityStatus;
  readonly symbol: string;
  readonly timeframe: string;
  readonly evaluatedAt: number;
  readonly validationResult: ValidationResult;
  readonly summary: DataQualitySummary;
  readonly recommendations: readonly string[];
}

/**
 * Function signature for pure signal generation on validated candle series.
 */
export type SignalGenerator<T> = (candles: readonly Candle[]) => T;

/**
 * Output of fail-closed signal generation fence.
 * Signal is guaranteed null if status is 'DATA_INVALID'.
 */
export interface SignalGenerationResult<T> {
  readonly status: QualityStatus;
  readonly signal: T | null;
  readonly report: DataQualityAssessmentReport;
}
