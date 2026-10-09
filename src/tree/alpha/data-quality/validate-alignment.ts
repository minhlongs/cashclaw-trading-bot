import type { AlignmentConfig, Candle, CheckResult, QualityViolation } from './types';
import {
  ALIGNMENT_DIMENSION,
  findClosestCandidate,
  validateConfig,
  checkEmptySeries,
} from './validate-alignment-helpers';

const DEFAULT_TOLERANCE_MS = 0;

function checkCandleAlignment(
  pCandle: Candle,
  i: number,
  secondary: readonly Candle[],
  toleranceMs: number,
): QualityViolation | undefined {
  if (!Number.isFinite(pCandle.timestamp)) {
    return {
      dimension: ALIGNMENT_DIMENSION,
      message: `Primary series contains non-finite timestamp at index ${i}: ${pCandle.timestamp}`,
      index: i,
      timestamp: Number.isFinite(pCandle.timestamp) ? pCandle.timestamp : undefined,
      details: { primaryIndex: i, primaryTimestamp: pCandle.timestamp },
    };
  }
  const { closest, diff } = findClosestCandidate(pCandle.timestamp, secondary);
  if (!Number.isFinite(diff) || diff > toleranceMs) {
    return {
      dimension: ALIGNMENT_DIMENSION,
      message: `Alignment mismatch at index ${i}: primary timestamp ${pCandle.timestamp} deviates from nearest secondary ${closest.timestamp} by ${diff}ms (tolerance: ${toleranceMs}ms)`,
      index: i,
      timestamp: pCandle.timestamp,
      details: {
        primaryIndex: i,
        primaryTimestamp: pCandle.timestamp,
        nearestSecondaryTimestamp: closest.timestamp,
        diffMs: diff,
        toleranceMs,
      },
    };
  }
  return undefined;
}

function checkSecondaryTimestamps(secondary: readonly Candle[]): QualityViolation[] {
  const violations: QualityViolation[] = [];
  for (let j = 0; j < secondary.length; j++) {
    const sCandle = secondary[j];
    if (!Number.isFinite(sCandle.timestamp)) {
      violations.push({
        dimension: ALIGNMENT_DIMENSION,
        message: `Secondary series contains non-finite timestamp at index ${j}: ${sCandle.timestamp}`,
        index: j,
        timestamp: Number.isFinite(sCandle.timestamp) ? sCandle.timestamp : undefined,
        details: { secondaryIndex: j, timestamp: sCandle.timestamp },
      });
    }
  }
  return violations;
}

function checkPrimaryAlignment(
  primary: readonly Candle[],
  secondary: readonly Candle[],
  toleranceMs: number,
): QualityViolation[] {
  const violations: QualityViolation[] = [];
  for (let i = 0; i < primary.length; i++) {
    const v = checkCandleAlignment(primary[i], i, secondary, toleranceMs);
    if (v) violations.push(v);
  }
  return violations;
}

/**
 * Validates timestamp alignment between a primary and secondary OHLCV series.
 * If secondary series is not provided, check passes trivially.
 */
export function validateAlignment(
  primary: readonly Candle[],
  secondary?: readonly Candle[],
  config?: AlignmentConfig,
): CheckResult {
  if (secondary === undefined) {
    return { dimension: ALIGNMENT_DIMENSION, passed: true, violations: [] };
  }

  const configViolation = validateConfig(config);
  if (configViolation) {
    return { dimension: ALIGNMENT_DIMENSION, passed: false, violations: [configViolation] };
  }

  const emptySeriesResult = checkEmptySeries(primary, secondary);
  if (emptySeriesResult) {
    return emptySeriesResult;
  }

  const toleranceMs = config?.toleranceMs ?? DEFAULT_TOLERANCE_MS;
  const maxUnmatched = config?.maxUnmatchedCandles ?? 0;
  const secondaryViolations = checkSecondaryTimestamps(secondary);

  const recordedViolations: QualityViolation[] = [...secondaryViolations];
  if (secondaryViolations.length === 0) {
    recordedViolations.push(...checkPrimaryAlignment(primary, secondary, toleranceMs));
  }

  const lengthDiff = Math.abs(primary.length - secondary.length);
  const lengthViolation = lengthDiff > maxUnmatched;
  if (lengthViolation) {
    recordedViolations.push({
      dimension: ALIGNMENT_DIMENSION,
      message: `Series length discrepancy: primary (${primary.length}) vs secondary (${secondary.length}) exceeds tolerance`,
      details: { primaryLength: primary.length, secondaryLength: secondary.length, maxUnmatched },
    });
  }

  const passed = !lengthViolation && secondaryViolations.length === 0 && recordedViolations.length <= maxUnmatched;
  return {
    dimension: ALIGNMENT_DIMENSION,
    passed,
    violations: passed ? [] : recordedViolations,
  };
}
