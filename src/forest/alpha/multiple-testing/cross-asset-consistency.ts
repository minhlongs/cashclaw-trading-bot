// Multiple-Testing Defense — Cross-Asset Consistency (verdict C1)
// Mission §9 item 7: a strategy that only works on one asset is not a
// promotion signal. Operates on existing EvaluationReport shapes — no new
// data pipeline. Pure and deterministic: no I/O, no randomness.

import type { EvaluationReport } from '@/forest/alpha/evaluation/report';
import type {
  CrossAssetConsistencyOptions,
  CrossAssetConsistencyVerdict,
} from './types';

function validateOptions(options: CrossAssetConsistencyOptions): void {
  if (!(options.minPositiveFraction >= 0) || !(options.minPositiveFraction <= 1)) {
    throw new Error(
      `minPositiveFraction must be in [0, 1], got ${options.minPositiveFraction}`,
    );
  }
  if (!Number.isInteger(options.minAssets) || options.minAssets < 1) {
    throw new Error(`minAssets must be an integer >= 1, got ${options.minAssets}`);
  }
}

/**
 * Assess cross-asset consistency over one EvaluationReport per asset.
 *
 * An asset "passes" when its expectancy is strictly positive (expectancy
 * in EvaluationReport is already net of costs). The verdict requires both
 * breadth (`assetsTested >= minAssets`) and a positive fraction meeting
 * `minPositiveFraction`.
 *
 * Fail-closed: empty input or fewer reports than `minAssets` throws —
 * never a silent pass. One asset passing while the rest fail yields
 * `consistent: false`.
 */
export function assessCrossAssetConsistency(
  reports: readonly EvaluationReport[],
  options: CrossAssetConsistencyOptions,
): CrossAssetConsistencyVerdict {
  validateOptions(options);
  if (reports.length === 0) {
    throw new Error('assessCrossAssetConsistency requires at least 1 report');
  }
  if (reports.length < options.minAssets) {
    throw new Error(
      `assessCrossAssetConsistency requires at least ${options.minAssets} reports, got ${reports.length}`,
    );
  }

  let assetsPassed = 0;
  for (const report of reports) {
    if (!Number.isFinite(report.expectancy)) {
      throw new Error(
        `Report ${report.experimentId} has non-finite expectancy`,
      );
    }
    if (report.expectancy > 0) assetsPassed += 1;
  }

  const positiveFraction = assetsPassed / reports.length;
  const consistent = positiveFraction >= options.minPositiveFraction;

  return {
    assetsTested: reports.length,
    assetsPassed,
    positiveFraction,
    consistent,
  };
}
