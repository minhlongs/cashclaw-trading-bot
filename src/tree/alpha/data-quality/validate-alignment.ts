import type { AlignmentConfig, Candle, CheckResult, QualityViolation } from './types';

const DIMENSION = 'cross_source_alignment';
const DEFAULT_TOLERANCE_MS = 0;

function findClosestCandidate(target: number, secondary: readonly Candle[]): { closest: Candle; diff: number } {
  let low = 0;
  let high = secondary.length - 1;

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    if (secondary[mid].timestamp === target) return { closest: secondary[mid], diff: 0 };
    if (secondary[mid].timestamp < target) low = mid + 1;
    else high = mid - 1;
  }

  const candidates: Candle[] = [];
  if (high >= 0) candidates.push(secondary[high]);
  if (low < secondary.length) candidates.push(secondary[low]);

  let bestCandle = candidates[0];
  let minDiff = Math.abs(target - bestCandle.timestamp);

  for (let i = 1; i < candidates.length; i++) {
    const diff = Math.abs(target - candidates[i].timestamp);
    if (diff < minDiff) {
      minDiff = diff;
      bestCandle = candidates[i];
    }
  }

  return { closest: bestCandle, diff: minDiff };
}

function validateConfig(config?: AlignmentConfig): QualityViolation | undefined {
  const rawTolerance = config?.toleranceMs;
  if (rawTolerance !== undefined && (!Number.isFinite(rawTolerance) || rawTolerance < 0)) {
    return {
      dimension: DIMENSION,
      message: `Invalid toleranceMs: ${rawTolerance}. Must be a non-negative finite number.`,
      details: { config },
    };
  }

  const rawMaxUnmatched = config?.maxUnmatchedCandles;
  if (rawMaxUnmatched !== undefined && (!Number.isFinite(rawMaxUnmatched) || rawMaxUnmatched < 0)) {
    return {
      dimension: DIMENSION,
      message: `Invalid maxUnmatchedCandles: ${rawMaxUnmatched}. Must be a non-negative finite number.`,
      details: { config },
    };
  }

  return undefined;
}

function checkEmptySeries(primary: readonly Candle[], secondary: readonly Candle[]): CheckResult | undefined {
  if (primary.length === 0 && secondary.length === 0) {
    return { dimension: DIMENSION, passed: true, violations: [] };
  }
  if (secondary.length === 0 && primary.length > 0) {
    const msg = 'Secondary series is empty while primary series contains candles';
    return {
      dimension: DIMENSION,
      passed: false,
      violations: [{ dimension: DIMENSION, message: msg, details: { primaryCount: primary.length, secondaryCount: 0 } }],
    };
  }
  if (primary.length === 0 && secondary.length > 0) {
    const msg = 'Primary series is empty while secondary series contains candles';
    return {
      dimension: DIMENSION,
      passed: false,
      violations: [{ dimension: DIMENSION, message: msg, details: { primaryCount: 0, secondaryCount: secondary.length } }],
    };
  }
  return undefined;
}

function checkCandleAlignment(
  pCandle: Candle,
  i: number,
  secondary: readonly Candle[],
  toleranceMs: number,
): QualityViolation | undefined {
  if (!Number.isFinite(pCandle.timestamp)) {
    return {
      dimension: DIMENSION,
      message: `Primary series contains non-finite timestamp at index ${i}: ${pCandle.timestamp}`,
      index: i,
      timestamp: Number.isFinite(pCandle.timestamp) ? pCandle.timestamp : undefined,
      details: { primaryIndex: i, primaryTimestamp: pCandle.timestamp },
    };
  }
  const { closest, diff } = findClosestCandidate(pCandle.timestamp, secondary);
  if (!Number.isFinite(diff) || diff > toleranceMs) {
    return {
      dimension: DIMENSION,
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
        dimension: DIMENSION,
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
    return { dimension: DIMENSION, passed: true, violations: [] };
  }

  const configViolation = validateConfig(config);
  if (configViolation) {
    return { dimension: DIMENSION, passed: false, violations: [configViolation] };
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
      dimension: DIMENSION,
      message: `Series length discrepancy: primary (${primary.length}) vs secondary (${secondary.length}) exceeds tolerance`,
      details: { primaryLength: primary.length, secondaryLength: secondary.length, maxUnmatched },
    });
  }

  const passed = !lengthViolation && secondaryViolations.length === 0 && recordedViolations.length <= maxUnmatched;
  return {
    dimension: DIMENSION,
    passed,
    violations: passed ? [] : recordedViolations,
  };
}
