import type { GateCheck, RegimePerformance } from './types';

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
