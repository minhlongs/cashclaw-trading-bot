// ExperimentSpec — pure derivation helpers.
// Deterministic math (no I/O): barrier config, data window splitting, seed derivation.

import type { BarrierConfig } from '@/tree/alpha/labeling';
import type { DataWindow, ExperimentPeriod } from './experiment-spec-types';

/** Derivation constants for barrier config from horizon. */
export const BARRIER_DERIVATION = {
  /** Take-profit as fraction of horizon (e.g., 2% per 10 bars → 0.002 per bar). */
  tpPerBar: 0.002,
  /** Stop-loss as fraction of horizon (e.g., 1% per 10 bars → 0.001 per bar). */
  slPerBar: 0.001,
  /** Max holding time multiplier: horizonBars * timeframeMs * this factor. */
  timeoutMultiplier: 3,
} as const;

/** Parse timeframe string to milliseconds. Supports: 1m, 5m, 15m, 30m, 1h, 4h, 1d. */
export function parseTimeframeToMs(tf: string): number {
  const match = tf.match(/^(\d+)([mhd])$/);
  if (!match) return 3_600_000; // default 1h
  const value = Number(match[1]);
  const unit = match[2];
  switch (unit) {
    case 'm':
      return value * 60_000;
    case 'h':
      return value * 3_600_000;
    case 'd':
      return value * 86_400_000;
    default:
      return 3_600_000;
  }
}

/**
 * Derive a BarrierConfig from horizon and timeframe.
 * Default TP/SL/timeout proportional to horizon.
 * Derivation:
 * - takeProfitPct = horizonBars * BARRIER_DERIVATION.tpPerBar
 * - stopLossPct = horizonBars * BARRIER_DERIVATION.slPerBar
 * - maxHoldingMs = horizonBars * timeframeMs * BARRIER_DERIVATION.timeoutMultiplier
 * Where timeframeMs is derived from timeframe string (e.g., '1h' → 3600000ms).
 */
export function deriveBarrierConfig(
  horizonBars: number,
  timeframe: string,
): BarrierConfig {
  const timeframeMs = parseTimeframeToMs(timeframe);
  return {
    takeProfitPct: horizonBars * BARRIER_DERIVATION.tpPerBar,
    stopLossPct: horizonBars * BARRIER_DERIVATION.slPerBar,
    maxHoldingMs: horizonBars * timeframeMs * BARRIER_DERIVATION.timeoutMultiplier,
  };
}

/** Minimum training bars required (configurable floor). */
export const MIN_TRAIN_BARS = 200;

/**
 * Derive train/validation/test periods from a DataWindow.
 * Split: 70% train, 15% validation, 15% test (chronological, no shuffle).
 * Returns null if window too small for horizon + lookbacks + MIN_TRAIN_BARS.
 */
export function derivePeriods(
  dataWindow: DataWindow,
  horizonBars: number,
  maxLookback: number,
): { train: ExperimentPeriod; validation: ExperimentPeriod; test: ExperimentPeriod } | null {
  const totalBars = dataWindow.barCount;
  const requiredBars = maxLookback + horizonBars + MIN_TRAIN_BARS;

  if (totalBars < requiredBars) {
    return null;
  }

  const trainBars = Math.floor(totalBars * 0.7);
  const validationBars = Math.floor(totalBars * 0.15);
  const testBars = totalBars - trainBars - validationBars;

  if (trainBars < MIN_TRAIN_BARS) {
    return null;
  }

  const msPerBar = (dataWindow.latestTimestamp - dataWindow.earliestTimestamp) / totalBars;

  const trainEndIdx = trainBars;
  const validationEndIdx = trainBars + validationBars;

  const trainStartTs = dataWindow.earliestTimestamp;
  const trainEndTs = dataWindow.earliestTimestamp + trainEndIdx * msPerBar;
  const validationEndTs = dataWindow.earliestTimestamp + validationEndIdx * msPerBar;
  const testEndTs = dataWindow.latestTimestamp;

  return {
    train: { startTimestamp: trainStartTs, endTimestamp: trainEndTs, barCount: trainBars },
    validation: { startTimestamp: trainEndTs, endTimestamp: validationEndTs, barCount: validationBars },
    test: { startTimestamp: validationEndTs, endTimestamp: testEndTs, barCount: testBars },
  };
}

/** Default fixed seed (deterministic fallback). */
export const DEFAULT_SEED = 0xCAFEBABE;

/**
 * Derive a deterministic seed from specId hash (first 8 hex chars → u32).
 * Used when caller does not supply a seed.
 */
export function deriveSeedFromSpecId(specId: string): number {
  const first8 = specId.slice(0, 8);
  return parseInt(first8, 16) >>> 0;
}
