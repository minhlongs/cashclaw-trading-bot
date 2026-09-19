// Equity curve construction from a net-return series.

/**
 * Build an equity curve starting at 1.0 with one entry per net return.
 * equityCurve length = netReturns.length + 1.
 * Returns { curve, totalReturn }.
 */
export function buildEquityCurve(
  netReturns: readonly number[],
): { equityCurve: number[]; totalReturn: number } {
  const equityCurve: number[] = [1];
  let equity = 1;
  for (const r of netReturns) {
    equity *= 1 + r;
    equityCurve.push(equity);
  }
  return { equityCurve, totalReturn: equity - 1 };
}
