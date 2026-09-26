import type { Candle, CheckResult, QualityViolation, VolumeConfig } from './types';

const DIMENSION = 'volume_anomalies';

function checkBasicVolume(candle: Candle, index: number, allowZero: boolean): QualityViolation | null {
  const { volume, timestamp } = candle;
  if (!Number.isFinite(volume) || volume < 0) {
    return {
      dimension: DIMENSION,
      message: `Invalid volume at index ${index}: ${volume} (must be non-negative and finite)`,
      index,
      timestamp,
      details: { index, timestamp, volume, reason: 'negative_or_non_finite' },
    };
  }

  if (!allowZero && volume === 0) {
    return {
      dimension: DIMENSION,
      message: `Zero volume detected at index ${index} when disallowed by configuration`,
      index,
      timestamp,
      details: { index, timestamp, volume: 0, reason: 'zero_disallowed' },
    };
  }
  return null;
}

function checkIsolatedZero(candles: readonly Candle[], index: number): QualityViolation | null {
  if (index <= 0 || index >= candles.length - 1) {
    return null;
  }
  const curr = candles[index];
  const prev = candles[index - 1];
  const next = candles[index + 1];

  if (curr.volume === 0 && prev.volume > 0 && next.volume > 0) {
    return {
      dimension: DIMENSION,
      message: `Suspicious isolated zero volume at index ${index} surrounded by non-zero volume (${prev.volume}, ${next.volume})`,
      index,
      timestamp: curr.timestamp,
      details: {
        index,
        timestamp: curr.timestamp,
        prevVolume: prev.volume,
        currVolume: curr.volume,
        nextVolume: next.volume,
        reason: 'isolated_zero_volume',
      },
    };
  }
  return null;
}

/**
 * Validates volume data:
 * 1. Volume must be non-negative (>= 0) and finite.
 * 2. Optional disallowance of zero volume.
 * 3. Optional detection of suspicious isolated zero-volume bars.
 * 4. Optional threshold on consecutive zero-volume bars.
 */
export function validateVolume(
  candles: readonly Candle[],
  config?: VolumeConfig,
): CheckResult {
  const violations: QualityViolation[] = [];
  const allowZero = config?.allowZeroVolume !== false;
  const flagIsolated = config?.flagIsolatedZeroVolume === true;
  const maxConsecutiveZeros = config?.maxConsecutiveZeroVolume;

  let zeroStreak = 0;

  for (let i = 0; i < candles.length; i++) {
    const candle = candles[i];
    const basicViolation = checkBasicVolume(candle, i, allowZero);
    if (basicViolation) {
      violations.push(basicViolation);
      continue;
    }

    if (flagIsolated) {
      const isolatedViolation = checkIsolatedZero(candles, i);
      if (isolatedViolation) {
        violations.push(isolatedViolation);
      }
    }

    if (candle.volume === 0) {
      zeroStreak++;
      if (maxConsecutiveZeros !== undefined && zeroStreak > maxConsecutiveZeros) {
        violations.push({
          dimension: DIMENSION,
          message: `Consecutive zero-volume streak (${zeroStreak}) exceeds threshold (${maxConsecutiveZeros}) at index ${i}`,
          index: i,
          timestamp: candle.timestamp,
          details: { index: i, timestamp: candle.timestamp, streak: zeroStreak, threshold: maxConsecutiveZeros },
        });
      }
    } else {
      zeroStreak = 0;
    }
  }

  return {
    dimension: DIMENSION,
    passed: violations.length === 0,
    violations,
  };
}
