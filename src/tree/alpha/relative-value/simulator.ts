// Pair-spread backtest simulator. Pure, deterministic, causal — no I/O,
// no Math.random/Date.now. Causality contract: β(t) and z(t) consume only
// data strictly before timestamp t; the position decided at t earns the
// return over t→t+1 (returns derived internally from the same panel).
// Fail-closed: invalid input/config throws; a closed tradability gate
// suppresses entry and forces FLAT; null β while positioned forces FLAT;
// null z while positioned holds the previous state with a warning.

import type { PairPanel, PairSimConfig, PairSimResult } from './types';
import { buildSpreadSeries } from './spread';
import { validateEntryExitConfig, POSITION_FLAT } from './entry-exit';
import {
  deriveReturns,
  findWarmupEnd,
  resolveCostFraction,
  validateStructure,
} from './pair-period';
import {
  emptyResult,
  initialLoopState,
  isGatePeriod,
} from './simulator-state';
import { applyGate, decidePosition, recordPeriod } from './simulator-step';

export { GATE_SKIPPED_REASON } from './simulator-state';

/**
 * Simulate the pair-spread strategy over the panel.
 * One record per period t (from first causally-valid z through the
 * second-to-last timestamp); equity compounds from 1.0.
 */
export function runPairSpreadSim(panel: PairPanel, config: PairSimConfig): PairSimResult {
  validateStructure(panel, config);
  validateEntryExitConfig(config);

  const n = panel.timestamps.length;
  const returnsA = deriveReturns(panel.closesA);
  const returnsB = deriveReturns(panel.closesB);
  const spreadStates = buildSpreadSeries(panel, config);
  const warmupStart = findWarmupEnd(spreadStates.map((s) => s.zScore));
  if (warmupStart >= n - 1) return emptyResult();

  const loop = initialLoopState();
  const costFraction = resolveCostFraction(config);
  for (let idx = warmupStart; idx <= n - 2; idx++) {
    const timestamp = panel.timestamps[idx]!;
    const state = spreadStates[idx]!;
    if (isGatePeriod(idx - warmupStart, config.revalidateEvery)) {
      applyGate(loop, panel, config, timestamp);
    }

    const previous = loop.position;
    loop.position = decidePosition(loop, state, config, timestamp);
    if (previous !== loop.position && (previous === POSITION_FLAT || loop.position === POSITION_FLAT)) {
      loop.tradeCount++;
    }
    recordPeriod(loop, { panel, state, timestamp, idx, returnsA, returnsB, costFraction });
  }

  return {
    periods: loop.periods,
    equityCurve: loop.equityCurve,
    totalTurnover: loop.periods.reduce((sum, p) => sum + p.turnover, 0),
    totalCosts: loop.periods.reduce((sum, p) => sum + p.costPct, 0),
    tradeCount: loop.tradeCount,
    warnings: loop.warnings,
    validationTrail: loop.validationTrail,
  };
}
