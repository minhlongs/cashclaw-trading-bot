import type { Candle, CheckResult, FutureDataConfig, QualityViolation } from './types';

const DIMENSION = 'future_data';

/**
 * Validates that no candle timestamp lies in the future relative to `asOf`.
 * Prevents lookahead bias and future-data contamination.
 */
export function validateFutureData(
  candles: readonly Candle[],
  config?: FutureDataConfig,
): CheckResult {
  const violations: QualityViolation[] = [];

  if (!config || !Number.isFinite(config.asOf)) {
    violations.push({
      dimension: DIMENSION,
      message: 'Missing or non-finite "asOf" reference timestamp for future data check',
      details: { config },
    });
    return { dimension: DIMENSION, passed: false, violations };
  }

  const asOf = config.asOf;

  for (let i = 0; i < candles.length; i++) {
    const candle = candles[i];
    if (!Number.isFinite(candle.timestamp)) {
      violations.push({
        dimension: DIMENSION,
        message: `Non-finite timestamp detected at index ${i}: ${candle.timestamp}`,
        index: i,
        timestamp: candle.timestamp,
        details: {
          index: i,
          timestamp: candle.timestamp,
          asOf,
        },
      });
    } else if (candle.timestamp > asOf) {
      const delta = candle.timestamp - asOf;
      violations.push({
        dimension: DIMENSION,
        message: `Future data detected at index ${i}: timestamp ${candle.timestamp} > asOf ${asOf} (lookahead: +${delta}ms)`,
        index: i,
        timestamp: candle.timestamp,
        details: {
          index: i,
          timestamp: candle.timestamp,
          asOf,
          lookaheadDeltaMs: delta,
        },
      });
    }
  }

  return {
    dimension: DIMENSION,
    passed: violations.length === 0,
    violations,
  };
}
