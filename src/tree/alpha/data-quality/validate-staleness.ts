import { isValidTimeframe, parseTimeframe } from './timeframe';
import type { Candle, CheckResult, QualityViolation, StalenessConfig } from './types';

const DIMENSION = 'stale_data';
const DEFAULT_MAX_STALE_INTERVALS = 2;

function resolveMaxStalenessMs(config?: StalenessConfig): number | undefined {
  if (config?.maxStalenessMs && config.maxStalenessMs > 0) {
    return config.maxStalenessMs;
  }
  if (config?.timeframe) {
    try {
      const interval = parseTimeframe(config.timeframe);
      const multiplier = config.maxStaleIntervals ?? DEFAULT_MAX_STALE_INTERVALS;
      return interval * multiplier;
    } catch {
      return undefined;
    }
  }
  return undefined;
}

/**
 * Validates that the latest candle timestamp is fresh relative to the reference `asOf` time.
 * Fails closed if data is empty, reference time is missing, or staleness threshold is exceeded.
 */
export function validateStaleness(
  candles: readonly Candle[],
  config?: StalenessConfig,
): CheckResult {
  const violations: QualityViolation[] = [];

  if (!config || !Number.isFinite(config.asOf)) {
    violations.push({
      dimension: DIMENSION,
      message: 'Missing or non-finite "asOf" reference timestamp for staleness check',
      details: { config },
    });
    return { dimension: DIMENSION, passed: false, violations };
  }

  if (config.timeframe !== undefined && !isValidTimeframe(config.timeframe)) {
    violations.push({
      dimension: DIMENSION,
      message: `Invalid timeframe format: "${config.timeframe}". Expected pattern like '1m', '5m', '1h', '1d'.`,
      details: { timeframe: config.timeframe },
    });
    return { dimension: DIMENSION, passed: false, violations };
  }

  if (candles.length === 0) {
    violations.push({
      dimension: DIMENSION,
      message: 'Candle series is empty; cannot verify feed freshness',
      details: { asOf: config.asOf, candleCount: 0 },
    });
    return { dimension: DIMENSION, passed: false, violations };
  }

  const maxStalenessMs = resolveMaxStalenessMs(config);
  if (maxStalenessMs === undefined) {
    return { dimension: DIMENSION, passed: true, violations };
  }

  const latestIndex = candles.length - 1;
  const latestCandle = candles[latestIndex];
  const stalenessMs = config.asOf - latestCandle.timestamp;

  if (stalenessMs > maxStalenessMs) {
    violations.push({
      dimension: DIMENSION,
      message: `Candle series is stale: latest candle (${latestCandle.timestamp}) is ${stalenessMs}ms behind asOf (${config.asOf}), exceeding limit of ${maxStalenessMs}ms`,
      index: latestIndex,
      timestamp: latestCandle.timestamp,
      details: {
        asOf: config.asOf,
        latestTimestamp: latestCandle.timestamp,
        stalenessMs,
        maxAllowedStalenessMs: maxStalenessMs,
      },
    });
  }

  return {
    dimension: DIMENSION,
    passed: violations.length === 0,
    violations,
  };
}
