// Cross-sectional portfolio simulator (plan §3 Bước A). Pure, deterministic,
// causal — no I/O, no network, no Math.random/Date.now. Causality contract:
// weights decided at snapshot t earn return for period starting at t; no index
// touching period t reads data from timestamp > t.

import type { CrossSectionalSnapshot, Universe } from '@/tree/alpha/universe/types';

import { computeTurnover, sumTurnover } from './turnover';
import { buildWeights, resolveCostFraction, validateConfig } from './weight-builder';
import type {
  AssetReturnSeries,
  CrossSectionalSimConfig,
  CrossSectionalSimResult,
  RebalanceRecord,
} from './types';

/**
 * Index the return panel as symbol → (period-start timestamp → return).
 * Validates internal consistency (equal lengths, strictly increasing finite
 * timestamps). Throws on any structural violation (fail-closed).
 */
function indexReturnPanel(
  returnSeries: readonly AssetReturnSeries[],
): Map<string, Map<number, number>> {
  if (returnSeries.length === 0) {
    throw new Error('runCrossSectionalSim: returnSeries must be non-empty');
  }

  const index = new Map<string, Map<number, number>>();
  for (const series of returnSeries) {
    if (series.timestamps.length !== series.returns.length) {
      throw new Error(
        `runCrossSectionalSim: series '${series.symbol}' timestamps/returns length mismatch`,
      );
    }
    const byTime = new Map<number, number>();
    let prev = Number.NEGATIVE_INFINITY;
    for (let i = 0; i < series.timestamps.length; i++) {
      const t = series.timestamps[i];
      const r = series.returns[i];
      if (!Number.isFinite(t) || !Number.isFinite(r)) {
        throw new Error(`runCrossSectionalSim: series '${series.symbol}' has non-finite values`);
      }
      if (t <= prev) {
        throw new Error(
          `runCrossSectionalSim: series '${series.symbol}' timestamps not strictly increasing`,
        );
      }
      prev = t;
      byTime.set(t, r);
    }
    index.set(series.symbol, byTime);
  }
  return index;
}

function validateSnapshotAlignment(
  sorted: readonly CrossSectionalSnapshot[],
  universe: Universe,
  returnIndex: Map<string, Map<number, number>>,
): void {
  for (const snapshot of sorted) {
    if (snapshot.universeId !== universe.id) {
      throw new Error(
        `runCrossSectionalSim: snapshot universeId '${snapshot.universeId}' does not match universe '${universe.id}'`,
      );
    }
    for (const asset of snapshot.assets) {
      if (!returnIndex.has(asset.symbol)) {
        throw new Error(
          `runCrossSectionalSim: snapshot symbol '${asset.symbol}' missing from return panel`,
        );
      }
    }
  }
}

function computePeriodReturn(
  t: number,
  weights: Record<string, number>,
  returnIndex: Map<string, Map<number, number>>,
  warnings: string[],
): number {
  let grossReturn = 0;
  let available = 0;
  for (const symbol of Object.keys(weights)) {
    const ret = returnIndex.get(symbol)?.get(t);
    if (ret === undefined) {
      warnings.push(`Missing return for '${symbol}' at timestamp ${t}; excluded from gross return`);
      continue;
    }
    grossReturn += weights[symbol] * ret;
    available++;
  }
  if (available === 0) {
    throw new Error(
      `runCrossSectionalSim: no held asset has a return at timestamp ${t} (misaligned panel)`,
    );
  }
  return grossReturn;
}

function computeExposures(weights: Record<string, number>): { gross: number; net: number } {
  let grossExposure = 0;
  let netExposure = 0;
  for (const symbol of Object.keys(weights)) {
    grossExposure += Math.abs(weights[symbol]);
    netExposure += weights[symbol];
  }
  return { gross: grossExposure, net: netExposure };
}

function processPeriod(
  snapshot: CrossSectionalSnapshot,
  prevWeights: Record<string, number>,
  config: CrossSectionalSimConfig,
  returnIndex: Map<string, Map<number, number>>,
  warnings: string[],
): RebalanceRecord {
  const t = snapshot.timestamp;
  const weights = buildWeights(snapshot.assets, config);
  const grossReturn = computePeriodReturn(t, weights, returnIndex, warnings);
  const turnover = computeTurnover(prevWeights, weights);
  const costFraction = resolveCostFraction(config);
  const costPct = turnover * costFraction;
  const netReturn = grossReturn - costPct;
  const { gross: grossExposure, net: netExposure } = computeExposures(weights);

  return {
    timestamp: t,
    weights,
    turnover,
    costPct,
    grossReturn,
    netReturn,
    grossExposure,
    netExposure,
  };
}

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