// Beta-aware sizing for cross-sectional rebalances (plan §3 Step D).
// Pure, deterministic — no I/O, no network, no Math.random/Date.now.
// Causal: rolling betas consume only returns STRICTLY BEFORE each rebalance
// timestamp (gate inside the estimator).

import type {
  AssetReturnSeries,
  CrossSectionalSimConfig,
} from '@/tree/alpha/cross-sectional/types';
import {
  estimateRollingBetas,
  scaleWeightsToTargetBeta,
} from '@/tree/alpha/cross-sectional/beta-sizing';
import { buildWeights } from '@/tree/alpha/cross-sectional/weight-builder';
import type { CrossSectionalSnapshot, RankedAsset } from '@/tree/alpha/universe/types';
import type { CrossSectionalEvalConfig } from './evaluate-config';

export const DEFAULT_BETA_WINDOW = 20;
export const DEFAULT_BETA_MIN_OBS = 10;

/** Sized weights keyed by snapshot.assets REFERENCE (the WeighterFn input). */
export type WeightsByAssets = Map<readonly RankedAsset[], Record<string, number>>;

export interface SizingPass {
  readonly weightsByAssets: WeightsByAssets;
  /** Σ w·β̂ per rebalance WHERE sizing applied, in period order. */
  readonly realizedBetas: number[];
  readonly appliedEveryPeriod: boolean;
  readonly firstFallbackReason?: string;
}

export function sizeRebalances(
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
