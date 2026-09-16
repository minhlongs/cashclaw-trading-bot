// Cross-sectional portfolio simulator (plan §3 Bước A). Pure, deterministic,
// causal — no I/O, no network, no Math.random/Date.now. Causality contract:
// weights decided at snapshot t earn return for period starting at t; no index
// touching period t reads data from timestamp > t.

import type { CrossSectionalSnapshot, Universe } from '@/tree/alpha/universe/types';

import {
  indexReturnPanel,
  validateSnapshotAlignment,
  processPeriod,
} from './sim-helpers';
import { sumTurnover } from './turnover';
import { validateConfig } from './weight-builder';
import type {
  AssetReturnSeries,
  CrossSectionalSimConfig,
  CrossSectionalSimResult,
  RebalanceRecord,
} from './types';

/**
 * Simulate a long/short portfolio across ranked snapshots.
 *
 * Weights decided at snapshot t earn the return for the period starting at t.
 * Produces snapshots.length - 1 periods (the final snapshot is the terminal
 * boundary and earns no forward return).
 */
export function runCrossSectionalSim(
  universe: Universe,
  snapshots: readonly CrossSectionalSnapshot[],
  returnSeries: readonly AssetReturnSeries[],
  config: CrossSectionalSimConfig,
): CrossSectionalSimResult {
  validateConfig(config);
  if (snapshots.length === 0) {
    throw new Error('runCrossSectionalSim: snapshots must be non-empty');
  }
  if (snapshots.length < config.minObservations) {
    throw new Error(
      `runCrossSectionalSim: ${snapshots.length} snapshots below minObservations ${config.minObservations}`,
    );
  }
  if (snapshots.length < 2) {
    throw new Error('runCrossSectionalSim: need at least 2 snapshots to form one period');
  }

  const sorted = [...snapshots].sort((a, b) => a.timestamp - b.timestamp);
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].timestamp <= sorted[i - 1].timestamp) {
      throw new Error('runCrossSectionalSim: snapshot timestamps must be strictly increasing');
    }
  }

  const returnIndex = indexReturnPanel(returnSeries);
  validateSnapshotAlignment(sorted, universe, returnIndex);

  const periods: RebalanceRecord[] = [];
  const warnings: string[] = [];
  const equityCurve: number[] = [1];
  let prevWeights: Record<string, number> = {};
  let equity = 1;

  // Period k uses snapshot k's weights; last snapshot is terminal boundary.
  for (let k = 0; k < sorted.length - 1; k++) {
    const record = processPeriod(sorted[k], prevWeights, config, returnIndex, warnings);
    periods.push(record);

    equity *= 1 + record.netReturn;
    equityCurve.push(equity);
    prevWeights = record.weights;
  }

  return {
    periods,
    equityCurve,
    totalTurnover: sumTurnover(periods),
    totalCosts: periods.reduce((acc, p) => acc + p.costPct, 0),
    warnings,
  };
}
