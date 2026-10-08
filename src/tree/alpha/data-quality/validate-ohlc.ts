import type { Candle, CheckResult, QualityViolation } from './types';

const DIMENSION = 'impossible_ohlc';
const FLOAT_EPSILON = 1e-9;

function checkPricePositivity(candle: Candle, index: number): QualityViolation | null {
  const { open, high, low, close, timestamp } = candle;
  const nonPositive = [
    { name: 'open', val: open },
    { name: 'high', val: high },
    { name: 'low', val: low },
    { name: 'close', val: close },
  ].filter((p) => !Number.isFinite(p.val) || p.val <= 0);

  if (nonPositive.length > 0) {
    const invalidFields = nonPositive.map((p) => `${p.name}=${p.val}`).join(', ');
    return {
      dimension: DIMENSION,
      message: `Invalid non-positive or non-finite price at index ${index}: ${invalidFields}`,
      index,
      timestamp,
      details: { index, timestamp, open, high, low, close, invalidFields },
    };
  }
  return null;
}

function checkGeometricInvariants(candle: Candle, index: number): QualityViolation | null {
  const { open, high, low, close, timestamp } = candle;

  if (high < low) {
    return {
      dimension: DIMENSION,
      message: `High (${high}) is less than Low (${low}) at index ${index}`,
      index,
      timestamp,
      details: { index, timestamp, open, high, low, close, reason: 'high_below_low' },
    };
  }

  const maxOC = Math.max(open, close);
  const minOC = Math.min(open, close);

  if (high + FLOAT_EPSILON < maxOC) {
    return {
      dimension: DIMENSION,
      message: `High (${high}) is less than max(open, close) (${maxOC}) at index ${index}`,
      index,
      timestamp,
      details: { index, timestamp, open, high, low, close, reason: 'high_below_max_oc' },
    };
  }

  if (low - FLOAT_EPSILON > minOC) {
    return {
      dimension: DIMENSION,
      message: `Low (${low}) is greater than min(open, close) (${minOC}) at index ${index}`,
      index,
      timestamp,
      details: { index, timestamp, open, high, low, close, reason: 'low_above_min_oc' },
    };
  }

  return null;
}

/**
 * Validates geometric price invariants on OHLC candles:
 * 1. High >= max(Open, Close)
 * 2. Low <= min(Open, Close)
 * 3. High >= Low
 * 4. All prices are positive (> 0) and finite.
 */
export function validateOHLC(candles: readonly Candle[]): CheckResult {
  const violations: QualityViolation[] = [];

  for (let i = 0; i < candles.length; i++) {
    const candle = candles[i];
    const positivityViolation = checkPricePositivity(candle, i);
    if (positivityViolation) {
      violations.push(positivityViolation);
      continue;
    }

    const geometricViolation = checkGeometricInvariants(candle, i);
    if (geometricViolation) {
      violations.push(geometricViolation);
    }
  }

  return {
    dimension: DIMENSION,
    passed: violations.length === 0,
    violations,
  };
}
