// Pair-spread backtest simulator. Pure, deterministic, causal — no I/O,
// no Math.random/Date.now. Causality contract: β(t) and z(t) consume only
// data strictly before timestamp t; the position decided at t earns the
// return over t→t+1 (returns derived internally from the same panel).
// Fail-closed: invalid input/config throws; a closed tradability gate
// suppresses entry and forces FLAT; null β while positioned forces FLAT;
// null z while positioned holds the previous state with a warning.

import type {
  PairPanel,
  PairPeriodRecord,
  PairPositionState,
  PairSimConfig,
  PairSimResult,
  SpreadStateAtTime,
  PairValidationEntry,
} from './types';
import { buildSpreadSeries } from './spread';
import { validatePairTradable } from './validation';
import { nextPosition, validateEntryExitConfig, POSITION_FLAT } from './entry-exit';
import { computeTurnover } from '@/tree/alpha/cross-sectional/turnover';
import {
  buildWeights,
  computeExposures,
  deriveReturns,
  findWarmupEnd,
  resolveCostFraction,
  validateStructure,
} from './pair-period';

/** Should the tradability gate run at this period? First period + cadence. */
function isGatePeriod(periodOffset: number, revalidateEvery: number): boolean {
  return periodOffset % revalidateEvery === 0;
}

/** Trail reason recorded for gate periods when the gate is disabled. */
export const GATE_SKIPPED_REASON = 'skipped';

interface SimLoopState {
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

function emptyResult(): PairSimResult {
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

function initialLoopState(): SimLoopState {
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

function applyGate(
  loop: SimLoopState,
  panel: PairPanel,
  config: PairSimConfig,
  timestamp: number,
): void {
  // Opt-out (inSimTradabilityGate === false, default true): no gate runs;
  // the period stays tradeable and the trail records the skip explicitly.
  if (config.inSimTradabilityGate === false) {
    loop.validationTrail.push({
      timestamp,
      tradable: true,
      reasons: [GATE_SKIPPED_REASON],
    });
    loop.gateOpen = true;
    return;
  }
  const verdict = validatePairTradable(panel, config, timestamp);
  loop.validationTrail.push({
    timestamp,
    tradable: verdict.tradable,
    reasons: verdict.reasons,
  });
  loop.gateOpen = verdict.tradable;
  if (!loop.gateOpen && loop.position !== POSITION_FLAT) {
    loop.warnings.push(
      `validation gate failed at ${timestamp}: forced FLAT (${verdict.reasons.join('; ')})`,
    );
    loop.position = POSITION_FLAT;
  }
}

function decidePosition(
  loop: SimLoopState,
  state: SpreadStateAtTime,
  config: PairSimConfig,
  timestamp: number,
): PairPositionState {
  const previous = loop.position;
  if (!loop.gateOpen) return POSITION_FLAT;
  const decided = nextPosition(previous, state.zScore, config);
  if (previous !== POSITION_FLAT && state.zScore === null && decided !== POSITION_FLAT) {
    loop.warnings.push(`z-score unavailable at ${timestamp}: holding ${decided}`);
  }
  if (decided !== POSITION_FLAT && state.hedgeRatio === null) {
    loop.warnings.push(`null hedge ratio at ${timestamp} while ${decided}: forced FLAT`);
    return POSITION_FLAT;
  }
  // Entry filter (regime-aware arms): suppresses NEW positions only —
  // exits and holds are never blocked, so a position can never be trapped.
  if (
    previous === POSITION_FLAT &&
    decided !== POSITION_FLAT &&
    config.entryFilter !== undefined &&
    !config.entryFilter(timestamp)
  ) {
    return POSITION_FLAT;
  }
  return decided;
}

function recordPeriod(
  loop: SimLoopState,
  args: {
    readonly panel: PairPanel;
    readonly state: SpreadStateAtTime;
    readonly timestamp: number;
    readonly idx: number;
    readonly returnsA: readonly number[];
    readonly returnsB: readonly number[];
    readonly costFraction: number;
  },
): void {
  const weights = buildWeights(loop.position, args.panel.legA, args.panel.legB, args.state.hedgeRatio);
  const turnover = computeTurnover(loop.prevWeights, weights);
  const costPct = turnover * args.costFraction;
  const grossReturn =
    (weights[args.panel.legA] ?? 0) * args.returnsA[args.idx]! +
    (weights[args.panel.legB] ?? 0) * args.returnsB[args.idx]!;
  const netReturn = grossReturn - costPct;
  const { gross: grossExposure, net: netExposure } = computeExposures(weights);

  loop.equity *= 1 + netReturn;
  loop.equityCurve.push(loop.equity);
  loop.periods.push({
    timestamp: args.timestamp,
    position: loop.position,
    hedgeRatio: args.state.hedgeRatio,
    zScore: args.state.zScore,
    weights,
    turnover,
    costPct,
    grossReturn,
    netReturn,
    grossExposure,
    netExposure,
  });
  loop.prevWeights = weights;
}

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
