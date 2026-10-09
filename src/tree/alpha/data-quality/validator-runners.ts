import type { Candle, CheckResult, DataQualityConfig, QualityDimension } from './types';
import { validateAlignment } from './validate-alignment';
import { validateDuplicates } from './validate-duplicates';
import { validateFutureData } from './validate-future-data';
import { validateIntervals } from './validate-intervals';
import { validateMonotonicity } from './validate-monotonicity';
import { validateOHLC } from './validate-ohlc';
import { validateOutage } from './validate-outage';
import { validateStaleness } from './validate-staleness';
import { validateVolume } from './validate-volume';

export interface Runner {
  readonly dimension: QualityDimension;
  readonly run: (candles: readonly Candle[], config?: DataQualityConfig, secondary?: readonly Candle[]) => CheckResult;
}

export const RUNNERS: readonly Runner[] = [
  { dimension: 'timestamp_monotonicity', run: (c) => validateMonotonicity(c) },
  { dimension: 'duplicate_candles', run: (c) => validateDuplicates(c) },
  {
    dimension: 'missing_intervals',
    run: (c, cfg) => validateIntervals(c, {
      expectedIntervalMs: cfg?.expectedIntervalMs ?? cfg?.missingIntervals?.expectedIntervalMs,
      timeframe: cfg?.timeframe ?? cfg?.missingIntervals?.timeframe,
      maxAllowedGapIntervals: cfg?.missingIntervals?.maxAllowedGapIntervals,
      toleranceRatio: cfg?.missingIntervals?.toleranceRatio,
    }),
  },
  {
    dimension: 'stale_data',
    run: (c, cfg) => {
      const asOf = cfg?.asOf ?? cfg?.staleness?.asOf;
      if (asOf === undefined) return { dimension: 'stale_data', passed: true, violations: [] };
      return validateStaleness(c, {
        asOf,
        timeframe: cfg?.timeframe ?? cfg?.staleness?.timeframe,
        maxStalenessMs: cfg?.staleness?.maxStalenessMs,
        maxStaleIntervals: cfg?.staleness?.maxStaleIntervals,
      });
    },
  },
  { dimension: 'impossible_ohlc', run: (c) => validateOHLC(c) },
  { dimension: 'volume_anomalies', run: (c, cfg) => validateVolume(c, cfg?.volume) },
  { dimension: 'cross_source_alignment', run: (c, cfg, s) => validateAlignment(c, s, cfg?.alignment) },
  {
    dimension: 'future_data',
    run: (c, cfg) => {
      const asOf = cfg?.asOf ?? cfg?.futureData?.asOf;
      if (asOf === undefined) return { dimension: 'future_data', passed: true, violations: [] };
      return validateFutureData(c, { asOf });
    },
  },
  { dimension: 'exchange_outage', run: (c, cfg) => validateOutage(c, cfg?.outage) },
];
