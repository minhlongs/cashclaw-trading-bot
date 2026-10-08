import type { Candle, CheckResult, QualityViolation } from './types';

const DIMENSION = 'timestamp_monotonicity';

/**
 * Validates that candle timestamps are strictly increasing (t_i > t_{i-1}).
 * Any non-increasing or non-finite timestamp constitutes a violation.
 */
export function validateMonotonicity(candles: readonly Candle[]): CheckResult {
  const violations: QualityViolation[] = [];

  for (let i = 0; i < candles.length; i++) {
    const current = candles[i];

    if (!Number.isFinite(current.timestamp)) {
      violations.push({
        dimension: DIMENSION,
        message: `Non-finite timestamp at index ${i}: ${current.timestamp}`,
        index: i,
        timestamp: current.timestamp,
        details: { index: i, timestamp: current.timestamp },
      });
      continue;
    }

    if (i > 0) {
      const prev = candles[i - 1];
      if (Number.isFinite(prev.timestamp) && current.timestamp <= prev.timestamp) {
        const diff = current.timestamp - prev.timestamp;
        violations.push({
          dimension: DIMENSION,
          message: `Non-monotonic timestamp at index ${i}: current (${current.timestamp}) <= previous (${prev.timestamp}), diff: ${diff}ms`,
          index: i,
          timestamp: current.timestamp,
          details: {
            previousIndex: i - 1,
            currentIndex: i,
            previousTimestamp: prev.timestamp,
            currentTimestamp: current.timestamp,
            diffMs: diff,
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
