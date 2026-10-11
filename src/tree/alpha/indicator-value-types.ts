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

export type IndicatorFn = (
  candles: readonly IndicatorCandle[],
  lookback: number,
  timeframe?: string,
) => IndicatorResult;

export type IndicatorRegistry = Record<string, IndicatorFn>;
import type { IndicatorCandle, IndicatorResult } from './indicator-candle-types';
