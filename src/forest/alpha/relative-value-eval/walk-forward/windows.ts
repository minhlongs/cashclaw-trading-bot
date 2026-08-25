// Walk-forward window planning for relative-value evaluation.
// Pure, deterministic — reuses the exported computeSlices semantics.
//
// Per-window panel assembly (causality contract):
//   - Pair selection consumes ONLY bars < trainEnd of the current window.
//   - The simulated panel = trainTail + validate + test bars; a brief warmup
//     overlap may initialize state from TRAIN-tail data only.
//   - OOS periods are those DECIDED at timestamp >= testStartTime.

import { computeSlices, type WindowConfig, type WindowMode } from '@/forest/backtest/walkforward';
import type { UniversePanel } from '@/tree/alpha/relative-value';
import type { RVWindowBounds } from './types';

/** Planned window: bar-index bounds plus causal slices of the universe. */
export interface RVPlannedWindow {
  readonly bounds: RVWindowBounds;
  /** Training slice of the universe (bars [trainStart, trainEnd)). */
  readonly trainUniverse: UniversePanel;
  /** Simulation slice (trainTail + validate + test). */
  readonly simUniverse: UniversePanel;
}

/** Bars kept before testStart to warm up simulator state from train-tail data. */
export const WARMUP_BARS = 30;

function sliceUniverse(
  universe: UniversePanel,
  startBar: number,
  endBar: number,
): UniversePanel {
  return {
    symbols: universe.symbols,
    timestamps: universe.timestamps.slice(startBar, endBar),
    closes: universe.closes.map((row) => row.slice(startBar, endBar)),
  };
}

/**
 * Plan rolling/expanding walk-forward windows over a shared-timestamp
 * universe. Throws when no window fits (mirrors computeSlices fail-closed).
 */
export function planWindows(
  universe: UniversePanel,
  config: WindowConfig,
  mode: WindowMode,
): RVPlannedWindow[] {
  if (
    universe.timestamps.length !==
    (universe.closes[0]?.length ?? -1)
  ) {
    throw new Error('planWindows: closes rows must match timestamps length');
  }
  for (const row of universe.closes) {
    if (row.length !== universe.timestamps.length) {
      throw new Error('planWindows: closes rows must match timestamps length');
    }
  }
  const totalBars = universe.timestamps.length;
  const minBars = config.trainBars + config.validateBars + config.testBars;
  if (totalBars < minBars) {
    throw new Error(
      `planWindows: not enough bars (${totalBars} < ${minBars} train+validate+test)`,
    );
  }
  if (config.stepBars <= 0) throw new Error('planWindows: stepBars must be > 0');

  const slices = computeSlices(totalBars, config, mode);
  if (slices.length === 0) {
    throw new Error('planWindows: no valid windows produced');
  }

  return slices.map((s) => {
    // Warmup overlap: the simulated panel keeps the WARMUP_BARS immediately
    // preceding testStart (validate span first, spilling into the TRAIN tail
    // when WARMUP_BARS exceeds it) plus the full test span — contiguous bars,
    // never touching anything at or after testStart.
    const simStart = Math.max(s.testStart - WARMUP_BARS, s.trainEnd);
    const trainEndTime = universe.timestamps[s.trainEnd - 1]! + 1;
    const testStartTime = universe.timestamps[s.testStart]!;
    return {
      bounds: {
        trainStart: s.trainStart,
        trainEnd: s.trainEnd,
        validateStart: s.validateStart,
        validateEnd: s.validateEnd,
        testStart: s.testStart,
        testEnd: s.testEnd,
        trainEndTime,
        testStartTime,
      },
      trainUniverse: sliceUniverse(universe, s.trainStart, s.trainEnd),
      simUniverse: sliceUniverse(universe, simStart, s.testEnd),
    };
  });
}
