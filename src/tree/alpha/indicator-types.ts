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
