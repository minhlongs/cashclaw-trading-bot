import { isValidTimeframe, parseTimeframe } from './timeframe';
import type { Candle, CheckResult, MissingIntervalsConfig, QualityViolation } from './types';

const DIMENSION = 'missing_intervals';
const DEFAULT_TOLERANCE_RATIO = 0.1;

/**
 * Infers interval from minimum positive delta between consecutive candles.
 */
function inferInterval(candles: readonly Candle[]): number | undefined {
  let minDelta = Number.POSITIVE_INFINITY;
  for (let i = 1; i < candles.length; i++) {
    const delta = candles[i].timestamp - candles[i - 1].timestamp;
    if (delta > 0 && delta < minDelta) {
      minDelta = delta;
    }
  }
  return Number.isFinite(minDelta) ? minDelta : undefined;
}

/**
 * Resolves expected interval in milliseconds from config or series.
 */
function resolveIntervalMs(candles: readonly Candle[], config?: MissingIntervalsConfig): number | undefined {
  if (config?.expectedIntervalMs && config.expectedIntervalMs > 0) {
    return config.expectedIntervalMs;
  }
  if (config?.timeframe) {
    try {
      return parseTimeframe(config.timeframe);
    } catch {
      return undefined;
    }
  }
  return inferInterval(candles);
}

/**
 * Validates that no missing candle intervals or cadence gaps exist.
 */
export function validateIntervals(
  candles: readonly Candle[],
  config?: MissingIntervalsConfig,
): CheckResult {
  const violations: QualityViolation[] = [];

  if (config?.timeframe !== undefined && !isValidTimeframe(config.timeframe)) {
    violations.push({
      dimension: DIMENSION,
      message: `Invalid timeframe format: "${config.timeframe}". Expected pattern like '1m', '5m', '1h', '1d'.`,
      details: { timeframe: config.timeframe },
    });
    return { dimension: DIMENSION, passed: false, violations };
  }

  if (candles.length < 2) {
    return { dimension: DIMENSION, passed: true, violations };
  }

  const intervalMs = resolveIntervalMs(candles, config);
  if (!intervalMs || intervalMs <= 0) {
    return { dimension: DIMENSION, passed: true, violations };
  }

  const tolerance = config?.toleranceRatio ?? DEFAULT_TOLERANCE_RATIO;
  const maxAllowedGaps = config?.maxAllowedGapIntervals ?? 0;
  const threshold = intervalMs * (1 + tolerance);

  for (let i = 1; i < candles.length; i++) {
    const delta = candles[i].timestamp - candles[i - 1].timestamp;
    if (delta > threshold) {
      const estimatedCandles = Math.round(delta / intervalMs);
      const missingCount = Math.max(0, estimatedCandles - 1);

      if (missingCount > maxAllowedGaps) {
        violations.push({
          dimension: DIMENSION,
          message: `Missing interval gap of ${delta}ms at index ${i} (${candles[i - 1].timestamp} -> ${candles[i].timestamp}). Expected ~${intervalMs}ms (~${missingCount} missing candle(s)).`,
          index: i,
          timestamp: candles[i].timestamp,
          details: {
            previousIndex: i - 1,
            currentIndex: i,
            previousTimestamp: candles[i - 1].timestamp,
            currentTimestamp: candles[i].timestamp,
            gapMs: delta,
            expectedIntervalMs: intervalMs,
            missingCount,
          },
        });
      }
    }
  }

  return {
    dimension: DIMENSION,
    passed: violations.length === 0,
    violations,
  };
}
