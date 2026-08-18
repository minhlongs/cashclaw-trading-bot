// Indicator type definitions for the alpha library.
// Pure types — no runtime code, no side effects.

/** OHLCV candle — mirrors forest/backtest/ohlcv.Candle (no cross-layer dep). */
export interface IndicatorCandle {
  timestamp: number; // ms epoch
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

/** Where a feature's raw data comes from. */
export type FeatureSource =
  | 'ohlcv' // derived from open/high/low/close/volume candles
  | 'derivatives' // funding rate, open interest, liquidations, basis
  | 'orderbook' // spread, depth, imbalance
  | 'trades' // tape prints, volume delta
  | 'synthetic'; // computed purely from other features

/** Whether this feature is available for the given symbol/timeframe. */
export type FeatureAvailability = 'always' | 'when_listed' | 'when_derivatives_listed';

/** Result envelope returned by every indicator function. */
export interface IndicatorResult {
  /** Indicator name (matches registry key). */
  name: string;
  /** Timeframe the indicator was computed over. */
  timeframe: string;
  /** Number of candles required for a valid computation. */
  lookback: number;
  /** True iff this function is causal (no look-ahead bias). */
  causal: boolean;
  /** Source of the raw data this feature is derived from. */
  source: FeatureSource;
  /** When this feature is available for a given symbol/timeframe. */
  availability: FeatureAvailability;
  /** Timestamp of the last candle used for the result. */
  timestamp: number;
  /** The computed value(s). null means insufficient data. */
  value: IndicatorValue;
}

/** Union of possible indicator return shapes. */
export type IndicatorValue =
  | number
  | BollingerBandsValue
  | RSIValue
  | MACDValue
  | null;

export interface BollingerBandsValue {
  upper: number;
  middle: number;
  lower: number;
  bandwidth: number;
  percentB: number;
}

export interface RSIValue {
  rsi: number;
  overbought: boolean;
  oversold: boolean;
}

export interface MACDValue {
  macd: number;
  signal: number;
  histogram: number;
}

/** Function signature for every indicator in the library. */
export type IndicatorFn = (
  candles: readonly IndicatorCandle[],
  lookback: number,
  timeframe?: string,
) => IndicatorResult;

/** Registry of all indicators, keyed by snake_case name. */
export type IndicatorRegistry = Record<string, IndicatorFn>;

// ── Feature declaration contract ──────────────────────────────────────────────

/**
 * A declared feature: name, timeframe, source, lookback, availability, causal.
 *
 * Every feature in the alpha library must be declared through this contract.
 * A feature is the unit of information the research engine reasons about;
 * declaring it up front keeps the source/availability/causal properties
 * explicit and auditable instead of implicit in each implementation.
 */
export interface FeatureDeclaration {
  readonly name: string;
  readonly timeframe: string;
  readonly source: FeatureSource;
  readonly lookback: number;
  readonly availability: FeatureAvailability;
  readonly causal: boolean;
}

/**
 * Validate a feature declaration. Throws if the declaration is malformed or
 * non-causal — this is the gate that rejects look-ahead features before they
 * can ever reach a feature vector, a label, or an execution decision.
 */
export function declareFeature(d: FeatureDeclaration): FeatureDeclaration {
  if (!d.name || typeof d.name !== 'string') {
    throw new Error('feature declaration requires a non-empty name');
  }
  if (!d.timeframe || typeof d.timeframe !== 'string') {
    throw new Error(`feature '${d.name}' requires a timeframe`);
  }
  if (typeof d.lookback !== 'number' || d.lookback < 0 || !Number.isFinite(d.lookback)) {
    throw new Error(`feature '${d.name}' requires a non-negative finite lookback`);
  }
  if (!d.availability) {
    throw new Error(`feature '${d.name}' requires an availability`);
  }
  if (typeof d.causal !== 'boolean') {
    throw new Error(`feature '${d.name}' requires a causal flag`);
  }
  if (!d.causal) {
    throw new Error(`feature '${d.name}' is non-causal and is rejected — look-ahead bias is not allowed in features, labels, regime detection, or execution`);
  }
  return d;
}
