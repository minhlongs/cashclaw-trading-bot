// Wire-in seam composing beta-aware sizing, simulation, and evaluation
// reporting (plan §3 Step D). Pure orchestration — no I/O, no network, no
// Math.random/Date.now.
//
// Composition order: validate inputs → per-rebalance beta-aware sizing
// (causal: rolling betas consume only returns STRICTLY BEFORE each rebalance
// timestamp) → runCrossSectionalSim → buildCrossSectionalReport. Errors from
// any layer propagate verbatim — nothing is swallowed (fail-closed).

import type {
  AssetReturnSeries,
  CrossSectionalSimConfig,
  WeighterFn,
} from '@/tree/alpha/cross-sectional/types';
import {
  estimateRollingBetas,
  scaleWeightsToTargetBeta,
} from '@/tree/alpha/cross-sectional/beta-sizing';
import { runCrossSectionalSim } from '@/tree/alpha/cross-sectional/simulator';
import { buildWeights } from '@/tree/alpha/cross-sectional/weight-builder';
import type { CrossSectionalSnapshot, RankedAsset, Universe } from '@/tree/alpha/universe/types';
import { buildCrossSectionalReport } from './report';
import type { CrossSectionalEvalConfig, CrossSectionalResult } from './evaluate-config';
import { validateEvalInputs } from './evaluate-validate';

const DEFAULT_BETA_WINDOW = 20;
const DEFAULT_BETA_MIN_OBS = 10;

/** Sized weights keyed by snapshot.assets REFERENCE (the WeighterFn input). */
type WeightsByAssets = Map<readonly RankedAsset[], Record<string, number>>;

interface SizingPass {
  readonly weightsByAssets: WeightsByAssets;
  /** Σ w·β̂ per rebalance WHERE sizing applied, in period order. */
  readonly realizedBetas: number[];
  readonly appliedEveryPeriod: boolean;
  readonly firstFallbackReason?: string;
}

function sizeRebalances(
  sorted: readonly CrossSectionalSnapshot[],
  returnSeries: readonly AssetReturnSeries[],
  config: CrossSectionalEvalConfig,
  targetBeta: number,
): SizingPass {
  const window = config.betaWindow ?? DEFAULT_BETA_WINDOW;
  const minObs = config.betaMinObs ?? DEFAULT_BETA_MIN_OBS;
  const benchmark = config.benchmarkReturns as AssetReturnSeries; // validated present
  const baseConfig: CrossSectionalSimConfig = {
    topN: config.topN,
    bottomN: config.bottomN,
    minObservations: config.minObservations,
    weighter: config.weighter,
  };

  const weightsByAssets: WeightsByAssets = new Map();
  const realizedBetas: number[] = [];
  let appliedEveryPeriod = true;
  let firstFallbackReason: string | undefined;

  // One sizing decision per period-forming snapshot. Betas are estimated from
  // returns STRICTLY BEFORE the snapshot timestamp (gate inside the estimator).
  for (let k = 0; k < sorted.length - 1; k++) {
    const snapshot = sorted[k];
    const betas = estimateRollingBetas(
      returnSeries,
      benchmark,
      window,
      minObs,
      snapshot.timestamp,
    );
    const baseWeights = buildWeights(snapshot.assets, baseConfig);
    const scaled = scaleWeightsToTargetBeta(baseWeights, betas, targetBeta);

    if (scaled.betaApplied === false) {
      // Fail-closed: keep the snapshot's own weights, never invent a beta.
      weightsByAssets.set(snapshot.assets, baseWeights);
      appliedEveryPeriod = false;
      firstFallbackReason ??= scaled.fallbackReason;
      continue;
    }
    weightsByAssets.set(snapshot.assets, scaled.weights);
    if (scaled.betaApplied === true) {
      let realized = 0;
      for (const [symbol, weight] of Object.entries(scaled.weights)) {
        const beta = betas[symbol];
        if (beta !== null && beta !== undefined) realized += weight * beta;
      }
      realizedBetas.push(realized);
    }
  }
  return { weightsByAssets, realizedBetas, appliedEveryPeriod, firstFallbackReason };
}

/**
 * Evaluate a cross-sectional strategy end to end: optionally size each
 * rebalance to a target beta using only prior history, simulate causally,
 * and build the multi-asset evaluation report.
 *
 * With targetBeta ≠ 0 the report's `realizedBetaSeries` holds Σ w·β̂ per
 * rebalance in period order for the rebalances where sizing applied (fewer
 * entries than periods when some rebalances fell back). With targetBeta = 0
 * (default) the series stays empty and the sim runs the plain long/short book.
 */
export function evaluateCrossSectional(
  universe: Universe,
  snapshots: readonly CrossSectionalSnapshot[],
  assetReturnSeries: readonly AssetReturnSeries[],
  config: CrossSectionalEvalConfig,
): CrossSectionalResult {
  validateEvalInputs(universe, snapshots, assetReturnSeries, config);

  const sorted = [...snapshots].sort((a, b) => a.timestamp - b.timestamp);
  const targetBeta = config.targetBeta ?? 0;
  const pass =
    targetBeta !== 0 ? sizeRebalances(sorted, assetReturnSeries, config, targetBeta) : undefined;

  // The simulator invokes the weighter once per period snapshot with that
  // snapshot's own assets array, so reference-keyed lookup routes each
  // rebalance to exactly its pre-sized weights. A miss means a caller shared
  // one assets array across snapshots — fail loudly rather than mis-size.
  const sizedLookup: WeighterFn | undefined = pass
    ? (assets) => {
        const weights = pass.weightsByAssets.get(assets);
        if (weights === undefined) {
          throw new Error(
            'evaluateCrossSectional: no sized weights for snapshot ranking (assets array shared across snapshots?)',
          );
        }
        return weights;
      }
    : undefined;

  const simConfig: CrossSectionalSimConfig = {
    topN: config.topN,
    bottomN: config.bottomN,
    minObservations: config.minObservations,
    costBps: config.costBps,
    stressMode: config.stressMode,
    weighter: sizedLookup ?? config.weighter,
  };

  const sim = runCrossSectionalSim(universe, sorted, assetReturnSeries, simConfig);

  const report = buildCrossSectionalReport(sim, {
    experimentId: config.experimentId,
    symbol: universe.id,
    timeframe: config.timeframe,
    regime: config.regime,
    periodsPerYear: config.periodsPerYear,
    stressMode: config.stressMode ?? 'conservative',
    regimeLabels: config.regimeLabels,
  });

  const realizedBetaSeries = pass ? pass.realizedBetas : [];
  const sizing = pass
    ? pass.appliedEveryPeriod
      ? { betaApplied: true }
      : {
          betaApplied: false,
          ...(pass.firstFallbackReason !== undefined
            ? { fallbackReason: pass.firstFallbackReason }
            : {}),
        }
    : { betaApplied: false };

  return { sim, report: { ...report, realizedBetaSeries }, sizing };
}
