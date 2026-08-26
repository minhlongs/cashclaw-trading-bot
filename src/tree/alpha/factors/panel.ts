// Symbol×time OHLCV panel types + causal forward-return builder (Phase 3, D3).
// Pure, deterministic — no I/O, no network, no Node APIs. Validation mirrors
// the fail-closed style of cross-sectional/simulator.ts `indexReturnPanel`.
//
// FORWARD-DATA BOUNDARY (binding): `buildForwardReturnSeries` reads future
// closes BY DEFINITION, so forward returns exist ONLY here and in the IC
// metrics module. They are an EVALUATION metric (measuring how well past
// scores predicted realized returns) and must NEVER feed signal construction:
// the zoo evaluator (src/tree/research/alpha/zoo/operator-*) cannot reach
// this module by construction.

/** One symbol's raw OHLCV panel. All arrays equal length; vwap optional. */
export interface SymbolPanel {
  readonly symbol: string;
  /** Unix timestamps (ms), strictly increasing, finite. */
  readonly timestamps: readonly number[];
  readonly open: readonly number[];
  readonly high: readonly number[];
  readonly low: readonly number[];
  readonly close: readonly number[];
  readonly volume: readonly number[];
  /** Optional pre-supplied vwap; materialized at build time when absent. */
  readonly vwap?: readonly number[];
}

/**
 * One symbol's forward-return series. `forwardReturns[i]` is the return
 * earned from close[i] to close[i+h] — future data relative to bar i, so
 * this series is only ever an evaluation target, never a feature.
 */
export interface ForwardReturnSeries {
  readonly symbol: string;
  readonly timestamps: readonly number[];
  /** fwd[i] = close[i+h]/close[i] − 1; the trailing h entries are null. */
  readonly forwardReturns: readonly (number | null)[];
}

/**
 * Validate a panel fail-closed: non-empty, equal-length arrays, strictly
 * increasing finite timestamps, finite OHLCV values (and vwap when present).
 * Throws with a descriptive message on any violation.
 */
export function validateSymbolPanel(panel: SymbolPanel): void {
  const prefix = `validateSymbolPanel: symbol '${panel.symbol}'`;
  const n = panel.timestamps.length;
  if (n === 0) throw new Error(`${prefix} has empty timestamps`);
  const fields: ReadonlyArray<readonly [string, readonly number[]]> = [
    ['open', panel.open],
    ['high', panel.high],
    ['low', panel.low],
    ['close', panel.close],
    ['volume', panel.volume],
  ];
  for (const [name, values] of fields) {
    if (values.length !== n) {
      throw new Error(`${prefix} field '${name}' length ${values.length} !== timestamps length ${n}`);
    }
  }
  if (panel.vwap !== undefined && panel.vwap.length !== n) {
    throw new Error(`${prefix} field 'vwap' length ${panel.vwap.length} !== timestamps length ${n}`);
  }
  let prev = Number.NEGATIVE_INFINITY;
  for (let i = 0; i < n; i++) {
    const t = panel.timestamps[i];
    if (!Number.isFinite(t)) throw new Error(`${prefix} has non-finite timestamp at index ${i}`);
    if (t <= prev) {
      throw new Error(`${prefix} timestamps not strictly increasing at index ${i}`);
    }
    prev = t;
    for (const [name, values] of fields) {
      if (!Number.isFinite(values[i])) {
        throw new Error(`${prefix} field '${name}' has non-finite value at index ${i}`);
      }
    }
    if (panel.vwap !== undefined && !Number.isFinite(panel.vwap[i])) {
      throw new Error(`${prefix} field 'vwap' has non-finite value at index ${i}`);
    }
  }
}

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

/**
 * Validate a set of panels as an aligned cross-section: every panel valid on
 * its own AND all panels share the identical timestamp grid (same length and
 * same values). Throws on any violation (fail-closed, misaligned rejected).
 */
export function validateAlignedPanels(panels: readonly SymbolPanel[]): void {
  if (panels.length === 0) throw new Error('validateAlignedPanels: panels must be non-empty');
  for (const panel of panels) validateSymbolPanel(panel);
  const reference = panels[0];
  for (const panel of panels.slice(1)) {
    if (panel.timestamps.length !== reference.timestamps.length) {
      throw new Error(
        `validateAlignedPanels: symbol '${panel.symbol}' length ${panel.timestamps.length} !== reference length ${reference.timestamps.length}`,
      );
    }
    for (let i = 0; i < panel.timestamps.length; i++) {
      if (panel.timestamps[i] !== reference.timestamps[i]) {
        throw new Error(
          `validateAlignedPanels: symbol '${panel.symbol}' timestamp mismatch at index ${i}`,
        );
      }
    }
  }
}
