import type { Candle, CheckResult, OutageConfig, QualityViolation } from './types';

const DIMENSION = 'exchange_outage';
const DEFAULT_MAX_CONSECUTIVE_IDENTICAL_BARS = 3;

function areBarsIdentical(a: Candle, b: Candle): boolean {
  return (
    a.open === b.open &&
    a.high === b.high &&
    a.low === b.low &&
    a.close === b.close &&
    a.volume === b.volume
  );
}

function createOutageViolation(
  candles: readonly Candle[],
  startIndex: number,
  endIndex: number,
  streakLength: number,
  threshold: number,
): QualityViolation {
  return {
    dimension: DIMENSION,
    message: `Suspect exchange outage: ${streakLength} consecutive identical bars from index ${startIndex} to ${endIndex}`,
    index: startIndex,
    timestamp: candles[startIndex].timestamp,
    details: {
      startIndex,
      endIndex,
      consecutiveBars: streakLength,
      threshold,
      sampleCandle: candles[startIndex],
    },
  };
}

/**
 * Validates against exchange outage or frozen feed periods:
 * Detects consecutive identical OHLCV bars exceeding threshold.
 */
export function validateOutage(
  candles: readonly Candle[],
  config?: OutageConfig,
): CheckResult {
  const violations: QualityViolation[] = [];

  const rawMax = config?.maxConsecutiveIdenticalBars;
  if (rawMax !== undefined && (!Number.isFinite(rawMax) || rawMax <= 0)) {
    violations.push({
      dimension: DIMENSION,
      message: `Invalid maxConsecutiveIdenticalBars: ${rawMax}. Must be a positive finite number.`,
      details: { config },
    });
    return { dimension: DIMENSION, passed: false, violations };
  }

  const maxIdentical = rawMax ?? DEFAULT_MAX_CONSECUTIVE_IDENTICAL_BARS;

  if (candles.length < maxIdentical) {
    return { dimension: DIMENSION, passed: true, violations };
  }

  let streakStart = 0;
  let streakLength = 1;

  for (let i = 1; i < candles.length; i++) {
    if (areBarsIdentical(candles[i], candles[i - 1])) {
      streakLength++;
    } else {
      if (streakLength >= maxIdentical) {
        violations.push(createOutageViolation(candles, streakStart, i - 1, streakLength, maxIdentical));
      }
      streakStart = i;
      streakLength = 1;
    }
  }

  // Check terminal streak
  if (streakLength >= maxIdentical) {
    violations.push(createOutageViolation(candles, streakStart, candles.length - 1, streakLength, maxIdentical));
  }

  return {
    dimension: DIMENSION,
    passed: violations.length === 0,
    violations,
  };
}
