// State management and helper utilities for the pair-spread backtest simulator.
// Pure, deterministic — no I/O, no Math.random/Date.now.

import type {
  PairPeriodRecord,
  PairPositionState,
  PairSimResult,
  PairValidationEntry,
} from './types';
import { POSITION_FLAT } from './entry-exit';

/** Should the tradability gate run at this period? First period + cadence. */
export function isGatePeriod(periodOffset: number, revalidateEvery: number): boolean {
  return periodOffset % revalidateEvery === 0;
}

/** Trail reason recorded for gate periods when the gate is disabled. */
export const GATE_SKIPPED_REASON = 'skipped';

export interface SimLoopState {
  readonly periods: PairPeriodRecord[];
  readonly equityCurve: number[];
  readonly warnings: string[];
  readonly validationTrail: PairValidationEntry[];
  position: PairPositionState;
  prevWeights: Record<string, number>;
  equity: number;
  tradeCount: number;
  gateOpen: boolean;
}

export function emptyResult(): PairSimResult {
  return {
    periods: [],
    equityCurve: [1],
    totalTurnover: 0,
    totalCosts: 0,
    tradeCount: 0,
    warnings: [],
    validationTrail: [],
  };
}

export function initialLoopState(): SimLoopState {
  return {
    periods: [],
    equityCurve: [1],
    warnings: [],
    validationTrail: [],
    position: POSITION_FLAT,
    prevWeights: {},
    equity: 1,
    tradeCount: 0,
    gateOpen: false,
  };
}
