import type { Candle, CheckResult, QualityViolation } from './types';

const DIMENSION = 'duplicate_candles';

/**
 * Validates that no duplicate timestamps exist in the candle series.
 * Tracks first appearance of each timestamp and flags subsequent duplicates.
 */
export function validateDuplicates(candles: readonly Candle[]): CheckResult {
  const violations: QualityViolation[] = [];
  const seenTimestamps = new Map<number, number>();

  for (let i = 0; i < candles.length; i++) {
    const ts = candles[i].timestamp;

    if (!Number.isFinite(ts)) {
      continue; // Handled by monotonicity or individual validator
    }

    const firstSeen = seenTimestamps.get(ts);
    if (firstSeen !== undefined) {
      violations.push({
        dimension: DIMENSION,
        message: `Duplicate timestamp ${ts} at index ${i} (previously seen at index ${firstSeen})`,
        index: i,
        timestamp: ts,
        details: {
          timestamp: ts,
          firstSeenIndex: firstSeen,
          duplicateIndex: i,
        },
      });
    } else {
      seenTimestamps.set(ts, i);
    }
  }

  return {
    dimension: DIMENSION,
    passed: violations.length === 0,
    violations,
  };
}
