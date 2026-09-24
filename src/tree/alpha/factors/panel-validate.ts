// Symbol×time OHLCV panel types + validation (fail-closed, throws on violation)
// Pure, deterministic — no I/O, no network, no Node APIs.

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