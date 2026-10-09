import type { AlignmentConfig, Candle, CheckResult, QualityViolation } from './types';

export const ALIGNMENT_DIMENSION = 'cross_source_alignment';

export function findClosestCandidate(target: number, secondary: readonly Candle[]): { closest: Candle; diff: number } {
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

export function validateConfig(config?: AlignmentConfig): QualityViolation | undefined {
  const rawTolerance = config?.toleranceMs;
  if (rawTolerance !== undefined && (!Number.isFinite(rawTolerance) || rawTolerance < 0)) {
    return {
      dimension: ALIGNMENT_DIMENSION,
      message: `Invalid toleranceMs: ${rawTolerance}. Must be a non-negative finite number.`,
      details: { config },
    };
  }

  const rawMaxUnmatched = config?.maxUnmatchedCandles;
  if (rawMaxUnmatched !== undefined && (!Number.isFinite(rawMaxUnmatched) || rawMaxUnmatched < 0)) {
    return {
      dimension: ALIGNMENT_DIMENSION,
      message: `Invalid maxUnmatchedCandles: ${rawMaxUnmatched}. Must be a non-negative finite number.`,
      details: { config },
    };
  }

  return undefined;
}

export function checkEmptySeries(primary: readonly Candle[], secondary: readonly Candle[]): CheckResult | undefined {
  if (primary.length === 0 && secondary.length === 0) {
    return { dimension: ALIGNMENT_DIMENSION, passed: true, violations: [] };
  }
  if (secondary.length === 0 && primary.length > 0) {
    const msg = 'Secondary series is empty while primary series contains candles';
    return {
      dimension: ALIGNMENT_DIMENSION,
      passed: false,
      violations: [{ dimension: ALIGNMENT_DIMENSION, message: msg, details: { primaryCount: primary.length, secondaryCount: 0 } }],
    };
  }
  if (primary.length === 0 && secondary.length > 0) {
    const msg = 'Primary series is empty while secondary series contains candles';
    return {
      dimension: ALIGNMENT_DIMENSION,
      passed: false,
      violations: [{ dimension: ALIGNMENT_DIMENSION, message: msg, details: { primaryCount: 0, secondaryCount: secondary.length } }],
    };
  }
  return undefined;
}
