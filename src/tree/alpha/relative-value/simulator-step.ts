// Step execution and position transition handlers for the pair-spread backtest simulator.
// Pure, deterministic — no I/O, no Math.random/Date.now.

import type {
  PairPanel,
  PairPositionState,
  PairSimConfig,
  SpreadStateAtTime,
} from './types';
import { validatePairTradable } from './validation';
import { nextPosition, POSITION_FLAT } from './entry-exit';
import { computeTurnover } from '@/tree/alpha/cross-sectional/turnover';
import { buildWeights, computeExposures } from './pair-period';
import { GATE_SKIPPED_REASON, type SimLoopState } from './simulator-state';

export interface RecordPeriodArgs {
  readonly panel: PairPanel;
  readonly state: SpreadStateAtTime;
  readonly timestamp: number;
  readonly idx: number;
  readonly returnsA: readonly number[];
  readonly returnsB: readonly number[];
  readonly costFraction: number;
}

export function applyGate(
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

export function decidePosition(
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

export function recordPeriod(loop: SimLoopState, args: RecordPeriodArgs): void {
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
