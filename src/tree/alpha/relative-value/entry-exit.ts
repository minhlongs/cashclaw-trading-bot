// Pure state machine for pair-spread entry/exit decisions.
// No side effects — caller emits warnings when zScore is null.
// Threshold preconditions: validated once by the simulator before the loop.

import type { PairPositionState, PairSimConfig } from './types';

export const POSITION_FLAT = 'flat' as const;
export const POSITION_LONG = 'long_spread' as const;
export const POSITION_SHORT = 'short_spread' as const;

/**
 * Next position state from the current state + z-score.
 *
 * Transitions:
 * - ANY -> FLAT when |z| >= stopZ (optional hard stop, checked first)
 * - LONG_SPREAD -> FLAT when z >= -exitZ
 * - SHORT_SPREAD -> FLAT when z <= +exitZ
 * - FLAT -> LONG_SPREAD when z <= -entryZ
 * - FLAT -> SHORT_SPREAD when z >= +entryZ
 * - null z => hold previous state (fail-safe during warmup)
 *
 * Precondition: config thresholds satisfy entryZ > exitZ >= 0.
 * Pure — no side effects.
 */
export function nextPosition(
  prev: PairPositionState,
  zScore: number | null,
  config: Pick<PairSimConfig, 'entryZ' | 'exitZ' | 'stopZ'>,
): PairPositionState {
  if (zScore === null) return prev;
  const abs = Math.abs(zScore);

  if (config.stopZ !== undefined && abs >= config.stopZ) return POSITION_FLAT;

  if (prev === POSITION_LONG && zScore >= -config.exitZ) return POSITION_FLAT;
  if (prev === POSITION_SHORT && zScore <= config.exitZ) return POSITION_FLAT;

  if (prev === POSITION_FLAT && zScore <= -config.entryZ) return POSITION_LONG;
  if (prev === POSITION_FLAT && zScore >= config.entryZ) return POSITION_SHORT;

  return prev;
}

/** Validate entry/exit/stop thresholds (throw on any violation). */
export function validateEntryExitConfig(config: Pick<PairSimConfig, 'entryZ' | 'exitZ' | 'stopZ'>): void {
  if (!Number.isFinite(config.entryZ) || config.entryZ <= 0) {
    throw new Error('entry-exit: entryZ must be a positive finite number');
  }
  if (!Number.isFinite(config.exitZ) || config.exitZ < 0) {
    throw new Error('entry-exit: exitZ must be a non-negative finite number');
  }
  if (config.entryZ <= config.exitZ) {
    throw new Error('entry-exit: entryZ must be strictly greater than exitZ');
  }
  if (config.stopZ !== undefined && (!Number.isFinite(config.stopZ) || config.stopZ <= 0)) {
    throw new Error('entry-exit: stopZ must be a positive finite number when set');
  }
}
