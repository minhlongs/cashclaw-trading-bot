// Microstructure data contracts — pure types, no I/O, no runtime code.
// Invariant: missing data is represented as null and is NEVER forward-filled.

/** Timestamped raw orderbook/trade inputs captured at a single instant. */
export interface MicrostructureSnapshot {
  /** Capture time in ms epoch. All inputs belong to this instant only. */
  timestamp: number;
  /** Trading pair this snapshot was captured for (e.g. 'BTCUSDT'). */
  symbol: string;
  /**
   * Raw inputs keyed by input name (e.g. 'best_bid', 'best_ask',
   * 'taker_buy_volume'). null means the input was missing at capture time;
   * it must propagate as null into derived features, never be fabricated.
   */
  rawInputs: Record<string, number | null>;
}

/**
 * Computed microstructure feature output for one timestamp.
 *
 * Causal by contract: every feature value uses only data available at or
 * before `timestamp`. Missing or insufficient data is null — forward-filling
 * is forbidden because a fabricated value is indistinguishable from a real
 * signal and would poison labels, regime detection, and execution.
 */
export interface FeatureVector {
  /** Time the features are valid for (ms epoch). */
  timestamp: number;
  /** Trading pair these features apply to. */
  symbol: string;
  /**
   * Feature values keyed by declared feature name (see contracts.ts).
   * null = missing/insufficient data at this timestamp.
   */
  features: Record<string, number | null>;
}
