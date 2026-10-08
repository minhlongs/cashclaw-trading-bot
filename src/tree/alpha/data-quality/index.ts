/**
 * Data Quality Layer (Tree Layer)
 * Pure, deterministic OHLCV candle series validation across 9 quality dimensions.
 */

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
} from './types';

export { isValidTimeframe, parseTimeframe } from './timeframe';
export { validateAlignment } from './validate-alignment';
export { validateDuplicates } from './validate-duplicates';
export { validateFutureData } from './validate-future-data';
export { validateIntervals } from './validate-intervals';
export { validateMonotonicity } from './validate-monotonicity';
export { validateOHLC } from './validate-ohlc';
export { validateOutage } from './validate-outage';
export { validateStaleness } from './validate-staleness';
export { validateVolume } from './validate-volume';
export { validateCandleSeries } from './validator';
