// Input validation for the wire-in seam (plan §3 Step D).
// Fail-closed: every structural violation throws before any computation.
// Sim-level field checks delegate to validateConfig (errors keep the
// runCrossSectionalSim prefix and propagate verbatim).

import type {
  AssetReturnSeries,
} from '@/tree/alpha/cross-sectional/types';
import { validateConfig } from '@/tree/alpha/cross-sectional/weight-builder';
import type { CrossSectionalSnapshot, Universe } from '@/tree/alpha/universe/types';
import type { CrossSectionalEvalConfig } from './evaluate-config';

/**
 * Validate the full evaluation input set. Throws on: invalid sim config,
 * empty return panel, non-finite/out-of-range eval fields, missing benchmark
 * for a non-zero beta target, empty/degenerate snapshot list, misaligned
 * snapshot timestamps or universeId, and regime-label count mismatch.
 */
export function validateEvalInputs(
  universe: Universe,
  snapshots: readonly CrossSectionalSnapshot[],
  returnSeries: readonly AssetReturnSeries[],
  config: CrossSectionalEvalConfig,
): void {
  validateConfig(config);
  checkReturnSeries(returnSeries);
  checkEvalFields(config);
  checkBenchmark(config);
  checkRegimeLabels(snapshots, config);
  checkSnapshots(universe, snapshots, config.minObservations);
}

function checkReturnSeries(returnSeries: readonly AssetReturnSeries[]): void {
  if (returnSeries.length === 0) {
    throw new Error('evaluateCrossSectional: assetReturnSeries must be non-empty');
  }
}

function checkEvalFields(config: CrossSectionalEvalConfig): void {
  const targetBeta = config.targetBeta ?? 0;
  if (!Number.isFinite(targetBeta)) {
    throw new Error('evaluateCrossSectional: targetBeta must be a finite number');
  }
  if (!Number.isFinite(config.periodsPerYear) || config.periodsPerYear <= 0) {
    throw new Error('evaluateCrossSectional: periodsPerYear must be a positive finite number');
  }
  if (
    config.betaWindow !== undefined &&
    (!Number.isInteger(config.betaWindow) || config.betaWindow <= 0)
  ) {
    throw new Error('evaluateCrossSectional: betaWindow must be a positive integer');
  }
  if (
    config.betaMinObs !== undefined &&
    (!Number.isInteger(config.betaMinObs) || config.betaMinObs <= 0)
  ) {
    throw new Error('evaluateCrossSectional: betaMinObs must be a positive integer');
  }
}

function checkBenchmark(config: CrossSectionalEvalConfig): void {
  const targetBeta = config.targetBeta ?? 0;
  if (targetBeta !== 0 && config.benchmarkReturns === undefined) {
    throw new Error('evaluateCrossSectional: benchmarkReturns is required when targetBeta !== 0');
  }
}

function checkRegimeLabels(
  snapshots: readonly CrossSectionalSnapshot[],
  config: CrossSectionalEvalConfig,
): void {
  if (config.regimeLabels !== undefined && config.regimeLabels.length !== snapshots.length - 1) {
    throw new Error(
      `evaluateCrossSectional: regimeLabels length (${config.regimeLabels.length}) must equal period count (${snapshots.length - 1})`,
    );
  }
}

function checkSnapshots(
  universe: Universe,
  snapshots: readonly CrossSectionalSnapshot[],
  minObservations: number,
): void {
  if (snapshots.length === 0) {
    throw new Error('evaluateCrossSectional: snapshots must be non-empty');
  }
  if (snapshots.length < 2) {
    throw new Error('evaluateCrossSectional: need at least 2 snapshots to form one period');
  }
  if (snapshots.length < minObservations) {
    throw new Error(
      `evaluateCrossSectional: ${snapshots.length} snapshots below minObservations ${minObservations}`,
    );
  }
  for (let i = 1; i < snapshots.length; i++) {
    if (snapshots[i].timestamp <= snapshots[i - 1].timestamp) {
      throw new Error('evaluateCrossSectional: snapshot timestamps must be strictly increasing');
    }
  }
  for (const snapshot of snapshots) {
    if (snapshot.universeId !== universe.id) {
      throw new Error(
        `evaluateCrossSectional: snapshot universeId '${snapshot.universeId}' does not match universe '${universe.id}'`,
      );
    }
  }
}