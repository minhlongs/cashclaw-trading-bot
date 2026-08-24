// Microstructure data contracts — pure types, no I/O, no runtime code.
// Invariant: missing data is represented as null and is NEVER forward-filled.

import type { DepthPayload } from './snapshot-types';

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

/** A trade print already aggregated for feature computation. */
export interface AggregatedTrades {
  /** Timestamp this aggregation window ends at (snapshot instant). */
  timestamp: number;
  /** Taker-buy (aggressive buy) notional volume within the window. */
  buyVolume: number;
  /** Taker-sell (aggressive sell) notional volume within the window. */
  sellVolume: number;
  /** Whether the batch fully covered the expected poll window. */
  complete: boolean;
}

/**
 * A depth snapshot that has passed quality validation, paired with the trade
 * aggregation ending at the same instant. `trades` is null when no validated
 * trade batch covers this snapshot's window — trade-based features then stay
 * null (no forward-fill from neighbouring windows).
 */
export interface ValidatedSnapshot {
  timestamp: number;
  symbol: string;
  depth: DepthPayload;
  trades: AggregatedTrades | null;
}
