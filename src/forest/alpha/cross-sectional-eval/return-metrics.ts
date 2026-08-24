// Return-series metrics for cross-sectional evaluation (plan §3 Step C).
// Pure, deterministic — no I/O, no network, no Math.random/Date.now.
//
// Adapted from computeSharpe (forest/backtest/metrics.ts) and
// computeSortino/computeMaxDrawdown (forest/alpha/evaluation/report-helpers.ts),
// operating on plain portfolio return series / equity curves instead of
// trades. All functions are total: degenerate inputs yield null/0, never NaN.

/** Annualized Sharpe ratio of a per-period return series; null when < 2 obs or 0 std. */
export function annualizedSharpe(
  returns: readonly number[],
  periodsPerYear: number,
): number | null {
  if (!Number.isFinite(periodsPerYear) || periodsPerYear <= 0) {
    throw new Error('annualizedSharpe: periodsPerYear must be a positive finite number');
  }
  if (returns.length < 2) return null;

  const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
  const variance = returns.reduce((a, b) => a + (b - mean) ** 2, 0) / returns.length;
  const std = Math.sqrt(variance);
  if (std === 0) return null;
  return (mean / std) * Math.sqrt(periodsPerYear);
}

/**
 * Annualized Sortino ratio of a per-period return series; null when < 2 obs
 * or no downside dispersion. Downside deviation divides by the FULL period
 * count (standard target-downside-deviation convention), matching the
 * computeSortino pattern in report-helpers.ts.
 */
export function annualizedSortino(
  returns: readonly number[],
  periodsPerYear: number,
): number | null {
  if (!Number.isFinite(periodsPerYear) || periodsPerYear <= 0) {
    throw new Error('annualizedSortino: periodsPerYear must be a positive finite number');
  }
  if (returns.length < 2) return null;

  const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
  const downsideVar =
    returns.filter((r) => r < 0).reduce((a, r) => a + r ** 2, 0) / returns.length;
  const downsideStd = Math.sqrt(downsideVar);
  if (downsideStd === 0) return null;
  return (mean / downsideStd) * Math.sqrt(periodsPerYear);
}

/**
 * Maximum peak-to-trough drawdown of an equity curve, in PERCENT.
 * The first element is the initial equity anchor (e.g. 1.0); drawdown is
 * measured against the running peak including that anchor.
 */
export function maxDrawdownPct(equityCurve: readonly number[]): number {
  if (equityCurve.length === 0) return 0;

  let peak = equityCurve[0];
  let maxDdPct = 0;
  for (const equity of equityCurve) {
    if (equity > peak) peak = equity;
    if (peak <= 0) continue; // non-positive peak: percent drawdown undefined, skip
    const ddPct = ((peak - equity) / peak) * 100;
    if (ddPct > maxDdPct) maxDdPct = ddPct;
  }
  return maxDdPct;
}

/** Compounded total return of a per-period return series (1 → Π(1+r) − 1). */
export function compoundReturn(returns: readonly number[]): number {
  let equity = 1;
  for (const r of returns) {
    equity *= 1 + r;
  }
  return equity - 1;
}
