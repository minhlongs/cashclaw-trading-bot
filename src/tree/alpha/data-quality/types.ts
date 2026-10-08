/**
 * Pure Tree-layer domain types for OHLCV candle series data quality validation.
 * Zero external or forest dependencies. Deterministic and fail-closed.
 */

export interface Candle {
  readonly timestamp: number; // Milliseconds epoch
  readonly open: number;
  readonly high: number;
  readonly low: number;
  readonly close: number;
  readonly volume: number;
}

export type QualityDimension =
  | 'timestamp_monotonicity'
  | 'duplicate_candles'
  | 'missing_intervals'
  | 'stale_data'
  | 'impossible_ohlc'
  | 'volume_anomalies'
  | 'cross_source_alignment'
  | 'future_data'
  | 'exchange_outage';

export type QualityStatus = 'VALID' | 'DATA_INVALID';

export interface QualityViolation {
  readonly dimension: QualityDimension;
  readonly message: string;
  readonly index?: number;
  readonly timestamp?: number;
  readonly details: Readonly<Record<string, unknown>>;
}

export interface CheckResult {
  readonly dimension: QualityDimension;
  readonly passed: boolean;
  readonly violations: readonly QualityViolation[];
}

export interface ValidationResult {
  readonly valid: boolean;
  readonly status: QualityStatus; // Guaranteed 'DATA_INVALID' if valid === false
  readonly checkResults: readonly CheckResult[];
  readonly violations: readonly QualityViolation[];
  readonly totalCandles: number;
}

export interface MissingIntervalsConfig {
  readonly expectedIntervalMs?: number;
  readonly timeframe?: string;
  readonly maxAllowedGapIntervals?: number;
  readonly toleranceRatio?: number;
}

export interface StalenessConfig {
  readonly asOf: number;
  readonly maxStalenessMs?: number;
  readonly timeframe?: string;
  readonly maxStaleIntervals?: number;
}

export interface VolumeConfig {
  readonly allowZeroVolume?: boolean;
  readonly flagIsolatedZeroVolume?: boolean;
  readonly maxConsecutiveZeroVolume?: number;
}

export interface AlignmentConfig {
  readonly toleranceMs?: number;
  readonly maxUnmatchedCandles?: number;
}

export interface FutureDataConfig {
  readonly asOf: number;
}

export interface OutageConfig {
  readonly maxConsecutiveIdenticalBars?: number;
}

export interface DataQualityConfig {
  readonly asOf?: number;
  readonly timeframe?: string;
  readonly expectedIntervalMs?: number;
  readonly missingIntervals?: MissingIntervalsConfig;
  readonly staleness?: StalenessConfig;
  readonly volume?: VolumeConfig;
  readonly alignment?: AlignmentConfig;
  readonly futureData?: FutureDataConfig;
  readonly outage?: OutageConfig;
  readonly enabledDimensions?: readonly QualityDimension[];
}
