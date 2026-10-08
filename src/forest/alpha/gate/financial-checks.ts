/**
 * Financial and performance gate checks 1-6 for Alpha Research OS Phase 9.
 * Pure deterministic functions evaluating statistical sufficiency and return quality.
 */

import type { GateCheck, RegimePerformance } from './types';

/** Check 1: minTrades — Sufficient trade count (>= 30). */
export function checkMinTrades(numTrades: number, threshold = 30): GateCheck {
  const isInteger = Number.isInteger(numTrades);
  const passed = isInteger && numTrades >= 0 && numTrades >= threshold;
  return {
    name: 'min_trades',
    passed,
    actual: Number.isFinite(numTrades) ? numTrades : null,
    threshold,
    detail: Number.isFinite(numTrades)
      ? `${numTrades} trades vs. minimum ${threshold}`
      : `Invalid trade count: ${numTrades}`,
  };
}

/** Check 2: minNetExpectancy — Strictly positive net expectancy after costs (> 0). */
export function checkMinNetExpectancy(
  expectancy: number,
  threshold = 0,
): GateCheck {
  const passed = Number.isFinite(expectancy) && expectancy > threshold;
  return {
    name: 'min_net_expectancy',
    passed,
    actual: Number.isFinite(expectancy) ? expectancy : null,
    threshold,
    detail: Number.isFinite(expectancy)
      ? `Net expectancy ${expectancy.toFixed(4)} vs. minimum > ${threshold}`
      : `Invalid net expectancy: ${expectancy}`,
  };
}

/** Check 3: minProfitFactor — Profit factor >= 1.2. */
export function checkMinProfitFactor(
  profitFactor: number,
  threshold = 1.2,
): GateCheck {
  const passed = Number.isFinite(profitFactor)
    ? profitFactor >= threshold && profitFactor >= 0
    : profitFactor === Infinity;
  return {
    name: 'min_profit_factor',
    passed,
    actual: Number.isFinite(profitFactor) || profitFactor === Infinity ? profitFactor : null,
    threshold,
    detail: Number.isFinite(profitFactor) || profitFactor === Infinity
      ? `Profit factor ${Number.isFinite(profitFactor) ? profitFactor.toFixed(2) : String(profitFactor)} vs. minimum ${threshold}`
      : `Invalid profit factor: ${profitFactor}`,
  };
}

/** Check 4: maxDrawdown — Peak-to-trough equity decline <= 25%. */
export function checkMaxDrawdown(
  maxDrawdown: number,
  threshold = 0.25,
): GateCheck {
  const passed = Number.isFinite(maxDrawdown) && maxDrawdown >= 0 && maxDrawdown <= threshold;
  return {
    name: 'max_drawdown',
    passed,
    actual: Number.isFinite(maxDrawdown) ? maxDrawdown : null,
    threshold,
    detail: Number.isFinite(maxDrawdown)
      ? `Max drawdown ${(maxDrawdown * 100).toFixed(2)}% vs. maximum ${(threshold * 100).toFixed(2)}%`
      : `Invalid max drawdown: ${maxDrawdown}`,
  };
}

function formatSharpeSortinoDetail(
  sharpe: number | null,
  sortino: number | null,
  minSharpe: number,
  minSortino: number,
): string {
  if (sharpe === null || sortino === null) {
    return 'Sharpe or Sortino is null (insufficient data) — fails';
  }
  const sStr = Number.isFinite(sharpe) ? sharpe.toFixed(2) : String(sharpe);
  const soStr = Number.isFinite(sortino) ? sortino.toFixed(2) : String(sortino);
  return `Sharpe ${sStr} (min ${minSharpe}), Sortino ${soStr} (min ${minSortino})`;
}

/** Check 5: minSharpeSortino — Annualized Sharpe >= 1.0 and Sortino >= 1.2. */
export function checkMinSharpeSortino(
  sharpe: number | null,
  sortino: number | null,
  minSharpe = 1.0,
  minSortino = 1.2,
): GateCheck {
  const sharpeValid =
    sharpe !== null &&
    (Number.isFinite(sharpe) || sharpe === Infinity) &&
    sharpe >= minSharpe;
  const sortinoValid =
    sortino !== null &&
    (Number.isFinite(sortino) || sortino === Infinity) &&
    sortino >= minSortino;
  const passed = sharpeValid && sortinoValid;

  return {
    name: 'min_sharpe_sortino',
    passed,
    actual: sharpe !== null && Number.isFinite(sharpe) ? sharpe : null,
    threshold: minSharpe,
    detail: formatSharpeSortinoDetail(sharpe, sortino, minSharpe, minSortino),
  };
}

/** Check 6: minRegimeCoverage — Strategy trades profitably across >= 50% of experienced regimes. */
export function checkMinRegimeCoverage(
  byRegime: Record<string, RegimePerformance | undefined | null>,
  threshold = 0.50,
): GateCheck {
  const keys = Object.keys(byRegime).filter(
    (k) => byRegime[k] !== undefined && byRegime[k] !== null,
  );
  const experienced = keys.filter((k) => (byRegime[k]?.numTrades ?? 0) > 0);
  const profitable = experienced.filter((k) => (byRegime[k]?.netPnl ?? 0) > 0);
  const coverage = experienced.length === 0 ? 0 : profitable.length / experienced.length;
  const passed = experienced.length > 0 && Number.isFinite(threshold) && coverage >= threshold;

  return {
    name: 'min_regime_coverage',
    passed,
    actual: coverage,
    threshold,
    detail: `${profitable.length}/${experienced.length} regimes profitable (${(coverage * 100).toFixed(1)}%) vs. minimum ${(threshold * 100).toFixed(0)}%`,
  };
}
