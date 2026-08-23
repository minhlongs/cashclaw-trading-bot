// Multiple-Testing Defense — Walk-Forward Consistency
// A strategy that only works in one lucky out-of-sample window is not a
// promotion signal (mission §9). This check consumes the existing
// WalkForwardResult and demands that a configurable fraction of OOS
// windows show a positive test metric, with bounded sign flips.
// Pure and deterministic: no I/O, no randomness.

import type { WalkForwardResult } from '@/forest/backtest/walkforward';
import type {
  WalkForwardConsistencyOptions,
  WalkForwardConsistencyVerdict,
} from './types';

function validateOptions(options: WalkForwardConsistencyOptions): void {
  if (!(options.minPositiveFraction >= 0) || !(options.minPositiveFraction <= 1)) {
    throw new Error(
      `minPositiveFraction must be in [0, 1], got ${options.minPositiveFraction}`,
    );
  }
  if (!Number.isInteger(options.maxSignFlips) || options.maxSignFlips < 0) {
    throw new Error(
      `maxSignFlips must be a non-negative integer, got ${options.maxSignFlips}`,
    );
  }
}

/**
 * Assess whether a walk-forward result is consistent across OOS windows.
 *
 * - `positiveFraction`: share of windows whose test metric (Sharpe,
 *   falling back to total PnL when Sharpe is null) is strictly positive.
 * - `signFlips`: number of times the test metric changes sign between
 *   consecutive windows.
 * - `degradationRatio`: OOS/IS ratio from the walk-forward summary.
 *
 * Fail-closed: zero windows throws; one lucky window out of N yields
 * `positiveFraction < minPositiveFraction` and `consistent: false`.
 */
export function assessWalkForwardConsistency(
  wf: WalkForwardResult,
  options: WalkForwardConsistencyOptions,
): WalkForwardConsistencyVerdict {
  validateOptions(options);
  if (wf.windows.length === 0) {
    throw new Error('assessWalkForwardConsistency requires at least 1 window');
  }

  const metrics = wf.windows.map(
    (w) => w.testMetrics.sharpe_ratio ?? w.testMetrics.total_pnl,
  );

  let positive = 0;
  let signFlips = 0;
  for (let i = 0; i < metrics.length; i++) {
    if (metrics[i] > 0) positive += 1;
    if (i > 0 && Math.sign(metrics[i]) !== Math.sign(metrics[i - 1])) {
      signFlips += 1;
    }
  }

  const positiveFraction = positive / metrics.length;
  const consistent =
    positiveFraction >= options.minPositiveFraction &&
    signFlips <= options.maxSignFlips;

  return {
    positiveFraction,
    signFlips,
    degradationRatio: wf.aggregated.summaryStats.degradationRatio,
    consistent,
  };
}
