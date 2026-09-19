// Wire-in seam composing beta-aware sizing, simulation, and evaluation
// reporting (plan §3 Step D). Pure orchestration — no I/O, no network, no
// Math.random/Date.now.
//
// Composition order: validate inputs → per-rebalance beta-aware sizing
// (causal: rolling betas consume only returns STRICTLY BEFORE each rebalance
// timestamp) → runCrossSectionalSim → buildCrossSectionalReport. Errors from
// any layer propagate verbatim — nothing is swallowed (fail-closed).

import type { WeighterFn, AssetReturnSeries } from '@/tree/alpha/cross-sectional/types';
import { runCrossSectionalSim } from '@/tree/alpha/cross-sectional/simulator';
import type { CrossSectionalSnapshot, Universe } from '@/tree/alpha/universe/types';
import { buildCrossSectionalReport } from './report';
import type { CrossSectionalEvalConfig, CrossSectionalResult } from './evaluate-config';
import { validateEvalInputs } from './evaluate-validate';
import { sizeRebalances, type WeightsByAssets } from './evaluate-sizing';

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
        const weights = (pass.weightsByAssets as WeightsByAssets).get(assets);
        if (weights === undefined) {
          throw new Error(
            'evaluateCrossSectional: no sized weights for snapshot ranking (assets array shared across snapshots?)',
          );
        }
        return weights;
      }
    : undefined;

  const simConfig = {
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
