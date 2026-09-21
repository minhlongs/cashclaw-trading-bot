import type { CrossSectionalSnapshot, Universe } from '@/tree/alpha/universe/types';
import type { AssetReturnSeries } from './types';

/**
 * Index the return panel as symbol → (period-start timestamp → return).
 * Validates internal consistency (equal lengths, strictly increasing finite
 * timestamps). Throws on any structural violation (fail-closed).
 */
export function indexReturnPanel(
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

export function validateSnapshotAlignment(
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
