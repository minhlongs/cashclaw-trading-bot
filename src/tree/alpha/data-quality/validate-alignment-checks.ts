import type { Candle, QualityViolation } from './types';
import { ALIGNMENT_DIMENSION, findClosestCandidate } from './validate-alignment-helpers';

export function checkCandleAlignment(pCandle: Candle, i: number, secondary: readonly Candle[], toleranceMs: number): QualityViolation | undefined {
  if (!Number.isFinite(pCandle.timestamp)) {
    return { dimension: ALIGNMENT_DIMENSION, message: `Primary non-finite timestamp at ${i}: ${pCandle.timestamp}`, index: i, timestamp: undefined, details: { primaryIndex: i, primaryTimestamp: pCandle.timestamp } };
  }
  const { closest, diff } = findClosestCandidate(pCandle.timestamp, secondary);
  if (!Number.isFinite(diff) || diff > toleranceMs) {
    return {
      dimension: ALIGNMENT_DIMENSION,
      message: `Alignment mismatch at ${i}: primary ${pCandle.timestamp} deviates from nearest ${closest.timestamp} by ${diff}ms (tolerance: ${toleranceMs}ms)`,
      index: i, timestamp: pCandle.timestamp,
      details: { primaryIndex: i, primaryTimestamp: pCandle.timestamp, nearestSecondaryTimestamp: closest.timestamp, diffMs: diff, toleranceMs },
    };
  }
  return undefined;
}

export function checkSecondaryTimestamps(secondary: readonly Candle[]): QualityViolation[] {
  const violations: QualityViolation[] = [];
  for (let j = 0; j < secondary.length; j++) {
    const sCandle = secondary[j]!;
    if (!Number.isFinite(sCandle.timestamp)) {
      violations.push({ dimension: ALIGNMENT_DIMENSION, message: `Secondary non-finite timestamp at ${j}: ${sCandle.timestamp}`, index: j, timestamp: undefined, details: { secondaryIndex: j, timestamp: sCandle.timestamp } });
    }
  }
  return violations;
}

export function checkPrimaryAlignment(primary: readonly Candle[], secondary: readonly Candle[], toleranceMs: number): QualityViolation[] {
  return primary.map((c, i) => checkCandleAlignment(c, i, secondary, toleranceMs)).filter((v): v is QualityViolation => v !== undefined);
}
