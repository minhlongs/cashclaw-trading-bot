import type {
  Candle,
  CheckResult,
  DataQualityConfig,
  QualityDimension,
  ValidationResult,
} from './types';
import { validateAlignment } from './validate-alignment';
import { validateDuplicates } from './validate-duplicates';
import { validateFutureData } from './validate-future-data';
import { validateIntervals } from './validate-intervals';
import { validateMonotonicity } from './validate-monotonicity';
import { validateOHLC } from './validate-ohlc';
import { validateOutage } from './validate-outage';
import { validateStaleness } from './validate-staleness';
import { validateVolume } from './validate-volume';

interface Runner {
  readonly dimension: QualityDimension;
  readonly run: (
    candles: readonly Candle[],
    config?: DataQualityConfig,
    secondary?: readonly Candle[],
  ) => CheckResult;
}

const RUNNERS: readonly Runner[] = [
  {
    dimension: 'timestamp_monotonicity',
    run: (candles) => validateMonotonicity(candles),
  },
  {
    dimension: 'duplicate_candles',
    run: (candles) => validateDuplicates(candles),
  },
  {
    dimension: 'missing_intervals',
    run: (candles, cfg) =>
      validateIntervals(candles, {
        expectedIntervalMs: cfg?.expectedIntervalMs ?? cfg?.missingIntervals?.expectedIntervalMs,
        timeframe: cfg?.timeframe ?? cfg?.missingIntervals?.timeframe,
        maxAllowedGapIntervals: cfg?.missingIntervals?.maxAllowedGapIntervals,
        toleranceRatio: cfg?.missingIntervals?.toleranceRatio,
      }),
  },
  {
    dimension: 'stale_data',
    run: (candles, cfg) => {
      const asOf = cfg?.asOf ?? cfg?.staleness?.asOf;
      if (asOf === undefined) {
        return { dimension: 'stale_data', passed: true, violations: [] };
      }
      return validateStaleness(candles, {
        asOf,
        timeframe: cfg?.timeframe ?? cfg?.staleness?.timeframe,
        maxStalenessMs: cfg?.staleness?.maxStalenessMs,
        maxStaleIntervals: cfg?.staleness?.maxStaleIntervals,
      });
    },
  },
  {
    dimension: 'impossible_ohlc',
    run: (candles) => validateOHLC(candles),
  },
  {
    dimension: 'volume_anomalies',
    run: (candles, cfg) => validateVolume(candles, cfg?.volume),
  },
  {
    dimension: 'cross_source_alignment',
    run: (candles, cfg, secondary) => validateAlignment(candles, secondary, cfg?.alignment),
  },
  {
    dimension: 'future_data',
    run: (candles, cfg) => {
      const asOf = cfg?.asOf ?? cfg?.futureData?.asOf;
      if (asOf === undefined) {
        return { dimension: 'future_data', passed: true, violations: [] };
      }
      return validateFutureData(candles, { asOf });
    },
  },
  {
    dimension: 'exchange_outage',
    run: (candles, cfg) => validateOutage(candles, cfg?.outage),
  },
];

/**
 * Composite validator executing all 9 data quality dimensions.
 * Produces fail-closed result: any violation marks status as 'DATA_INVALID'.
 */
export function validateCandleSeries(
  candles: readonly Candle[],
  config?: DataQualityConfig,
  secondarySeries?: readonly Candle[],
): ValidationResult {
  const enabled = config?.enabledDimensions ? new Set(config.enabledDimensions) : null;
  const checkResults: CheckResult[] = [];

  for (const runner of RUNNERS) {
    if (enabled && !enabled.has(runner.dimension)) {
      continue;
    }
    try {
      checkResults.push(runner.run(candles, config, secondarySeries));
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      checkResults.push({
        dimension: runner.dimension,
        passed: false,
        violations: [
          {
            dimension: runner.dimension,
            message: `Unexpected error during ${runner.dimension} validation: ${errorMsg}`,
            details: { error: errorMsg },
          },
        ],
      });
    }
  }

  const violations = checkResults.flatMap((r) => r.violations);
  const passedAll = checkResults.every((r) => r.passed);
  const valid = passedAll && violations.length === 0;

  return {
    valid,
    status: valid ? 'VALID' : 'DATA_INVALID',
    checkResults,
    violations,
    totalCandles: candles.length,
  };
}
