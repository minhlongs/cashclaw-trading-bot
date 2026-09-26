/**
 * Robustness, leakage invariance, and provenance checks 9-15 for Phase 9 Promotion Gate.
 * Verifies parameter stability, walk-forward OOS consistency, causality, and reproducibility.
 */

import type {
  GateCheck,
  CandidateBaselineMetrics,
  BenchmarkMetrics,
  ReproducibleHashDetails,
} from './types';

/** Check 9: parameterRobustness — Normalized parameter sensitivity spread <= 0.5. */
export function checkParameterRobustness(spread: number, threshold = 0.5): GateCheck {
  const valid = Number.isFinite(spread);
  const passed = valid && spread >= 0 && spread <= threshold;
  return {
    name: 'parameter_robustness',
    passed,
    actual: valid ? spread : null,
    threshold,
    detail: valid
      ? `Parameter sensitivity spread ${spread.toFixed(4)} vs. maximum ${threshold}`
      : `Invalid parameter sensitivity spread: ${spread}`,
  };
}

/** Check 10: crossPeriodRobustness — Walk-forward consistency >= 60% positive OOS windows. */
export function checkCrossPeriodRobustness(positiveFraction: number, threshold = 0.60): GateCheck {
  const valid = Number.isFinite(positiveFraction);
  const passed = valid && positiveFraction >= threshold && positiveFraction <= 1.0;
  return {
    name: 'cross_period_robustness',
    passed,
    actual: valid ? positiveFraction : null,
    threshold,
    detail: valid
      ? `Walk-forward positive OOS windows ${(positiveFraction * 100).toFixed(1)}% vs. minimum ${(threshold * 100).toFixed(0)}%`
      : `Invalid walk-forward positive fraction: ${positiveFraction}`,
  };
}

/** Check 11: crossAssetRobustness — Multi-symbol consistency across correlated assets (>= 50% or exempt). */
export function checkCrossAssetRobustness(
  positiveAssetFraction?: number | null,
  applicable = true,
  threshold = 0.50,
): GateCheck {
  if (!applicable) {
    return {
      name: 'cross_asset_robustness',
      passed: true,
      actual: null,
      threshold,
      detail: 'Exempted: asset-specific strategy declaration',
    };
  }
  const valid = typeof positiveAssetFraction === 'number' && Number.isFinite(positiveAssetFraction);
  const passed = valid && positiveAssetFraction >= threshold && positiveAssetFraction <= 1.0;
  return {
    name: 'cross_asset_robustness',
    passed,
    actual: valid ? positiveAssetFraction : null,
    threshold,
    detail: valid
      ? `Cross-asset positive fraction ${(positiveAssetFraction * 100).toFixed(1)}% vs. minimum ${(threshold * 100).toFixed(0)}%`
      : 'Cross-asset fraction missing or invalid for multi-asset strategy',
  };
}

/** Check 12: leakageInvariance — Shift-future data mutations prove zero lookahead leakage (=== 0). */
export function checkLeakageInvariance(violations: number): GateCheck {
  const valid = Number.isInteger(violations);
  const passed = valid && violations === 0;
  return {
    name: 'leakage_invariance',
    passed,
    actual: valid ? violations : null,
    threshold: 0,
    detail: passed
      ? 'Zero lookahead leakage verified: 0 mutated historical decisions'
      : `Lookahead leakage detected: ${violations} mutated historical decisions (Observed ${violations} lookahead leakage mutations vs. strictly 0)`,
  };
}

/** Check 13: noSingleWindowDependency — Maximum single-window PnL contribution <= 50%, W=1 fails. */
export function checkNoSingleWindowDependency(
  windowPnls: readonly number[],
  threshold = 0.50,
): GateCheck {
  if (!Array.isArray(windowPnls) || windowPnls.length === 0) {
    return {
      name: 'no_single_window_dependency',
      passed: false,
      actual: null,
      threshold,
      detail: 'No window PnLs provided — fails dependency check',
    };
  }
  if (windowPnls.some((p) => !Number.isFinite(p))) {
    return {
      name: 'no_single_window_dependency',
      passed: false,
      actual: null,
      threshold,
      detail: 'Non-finite window PnL detected',
    };
  }
  if (windowPnls.length === 1) {
    return {
      name: 'no_single_window_dependency',
      passed: false,
      actual: 1.0,
      threshold,
      detail:
        'Single window evaluated (W=1) — fails anti-windfall requirement (requires multiple windows). Single window is not a promotion signal',
    };
  }
  const total = windowPnls.reduce((acc, p) => acc + p, 0);
  if (total <= 0) {
    return {
      name: 'no_single_window_dependency',
      passed: false,
      actual: null,
      threshold,
      detail: `Total window PnL is non-positive (${total.toFixed(2)}) — fails dependency check`,
    };
  }
  const contribution = Math.max(...windowPnls) / total;
  const passed = Number.isFinite(contribution) && contribution <= threshold;
  return {
    name: 'no_single_window_dependency',
    passed,
    actual: contribution,
    threshold,
    detail: `Max single window contributed ${(contribution * 100).toFixed(1)}% vs. max ${(threshold * 100).toFixed(0)}% (vs. maximum ${(threshold * 100).toFixed(0)}%)`,
  };
}

/** Check 14: baselineComparison — Candidate outperforms Buy & Hold and Random Entry on Sharpe and Net PnL. */
export function checkBaselineComparison(
  candidate: CandidateBaselineMetrics,
  buyHold: BenchmarkMetrics,
  randomEntry: BenchmarkMetrics,
): GateCheck {
  const candValid = Number.isFinite(candidate.sharpe) && Number.isFinite(candidate.netPnl);
  const bhSharpeBeaten = buyHold.sharpe === null || candidate.sharpe > buyHold.sharpe;
  const bhPnlBeaten = Number.isFinite(buyHold.netPnl) && candidate.netPnl > buyHold.netPnl;
  const reSharpeBeaten = randomEntry.sharpe === null || candidate.sharpe > randomEntry.sharpe;
  const rePnlBeaten = Number.isFinite(randomEntry.netPnl) && candidate.netPnl > randomEntry.netPnl;
  const passed = candValid && bhSharpeBeaten && bhPnlBeaten && reSharpeBeaten && rePnlBeaten;

  const bhSharpeStr = buyHold.sharpe !== null ? buyHold.sharpe.toFixed(2) : 'null';
  const reSharpeStr = randomEntry.sharpe !== null ? randomEntry.sharpe.toFixed(2) : 'null';
  const detail = candValid
    ? `Candidate (Sharpe: ${candidate.sharpe.toFixed(2)}, PnL: ${candidate.netPnl.toFixed(2)}) vs BH (Sharpe: ${bhSharpeStr}, PnL: ${buyHold.netPnl.toFixed(2)}) & Random (Sharpe: ${reSharpeStr}, PnL: ${randomEntry.netPnl.toFixed(2)})`
    : 'Invalid candidate metrics for baseline comparison';

  return {
    name: 'baseline_comparison',
    passed,
    actual: candValid ? candidate.netPnl : null,
    threshold: 'beats_both',
    detail,
  };
}

/** Check 15: reproducibleHash — Canonical experiment hash over git commit + seed + config verified. */
export function checkReproducibleHash(
  hashMatches: boolean,
  details?: ReproducibleHashDetails | string,
): GateCheck {
  const passed = hashMatches === true;
  let detail: string;
  if (typeof details === 'string') {
    detail = details;
  } else if (details && typeof details === 'object') {
    detail = passed
      ? `Canonical experiment hash verified: ${details.recordedHash ?? 'match'}`
      : `Mismatch: recorded ${details.recordedHash ?? 'unknown'} vs computed ${details.expectedHash ?? 'unknown'}`;
  } else {
    detail = passed ? 'Canonical experiment hash verified' : 'Canonical experiment hash mismatch';
  }
  return { name: 'reproducible_hash', passed, actual: hashMatches, threshold: true, detail };
}
