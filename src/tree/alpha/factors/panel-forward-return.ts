// Panel forward-return builder + vwap materialization.
// Pure, deterministic — no I/O, no network, no Node APIs. Validation mirrors
// the fail-closed style of cross-sectional/simulator.ts `indexReturnPanel`.
//
// FORWARD-DATA BOUNDARY (binding): `buildForwardReturnSeries` reads future
// closes BY DEFINITION, so forward returns exist ONLY here and in the IC
// metrics module. They are an EVALUATION metric (measuring how well past
// scores predicted realized returns) and must NEVER feed signal construction:
// the zoo evaluator (src/tree/research/alpha/zoo/operator-*) cannot reach
// this module by construction.

import { validateSymbolPanel, type ForwardReturnSeries, type SymbolPanel } from './panel-validate';

/**
 * Materialize vwap once at panel build: use the supplied vwap when present,
 * else fall back to the typical price (o+h+l+c)/4 (base.py crypto branch).
 * Validates the panel first; returns a finite array of length n.
 */
export function materializeVwap(panel: SymbolPanel): readonly number[] {
  validateSymbolPanel(panel);
  if (panel.vwap !== undefined) return panel.vwap;
  return panel.timestamps.map((_, i) => (panel.open[i] + panel.high[i] + panel.low[i] + panel.close[i]) / 4);
}

/**
 * Build the h-bar forward-return series for one panel.
 * fwd[i] = close[i+h]/close[i] − 1 for i ≤ n−1−h; the trailing h entries are
 * null (never extrapolated). A zero close[i] yields null (fail-closed).
 * h must be a positive integer. Throws on invalid h or invalid panel.
 */
export function buildForwardReturnSeries(panel: SymbolPanel, h: number): ForwardReturnSeries {
  if (!Number.isInteger(h) || h < 1) {
    throw new Error(`buildForwardReturnSeries: horizon must be a positive integer, got ${h}`);
  }
  validateSymbolPanel(panel);
  const n = panel.timestamps.length;
  const forwardReturns: (number | null)[] = new Array(n).fill(null);
  for (let i = 0; i + h < n; i++) {
    const base = panel.close[i];
    const future = panel.close[i + h];
    forwardReturns[i] = base === 0 ? null : future / base - 1;
  }
  return { symbol: panel.symbol, timestamps: panel.timestamps, forwardReturns };
}
