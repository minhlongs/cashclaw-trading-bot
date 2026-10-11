export interface IndicatorCandle {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export type FeatureSource =
  | 'ohlcv'
  | 'derivatives'
  | 'orderbook'
  | 'trades'
  | 'synthetic';

export type FeatureAvailability = 'always' | 'when_listed' | 'when_derivatives_listed';

export interface IndicatorResult {
  name: string;
  timeframe: string;
  lookback: number;
  causal: boolean;
  source: FeatureSource;
  availability: FeatureAvailability;
  timestamp: number;
  value: IndicatorValue;
}

export type IndicatorValue = number | BollingerBandsValue | RSIValue | MACDValue | null;
import type { BollingerBandsValue, RSIValue, MACDValue } from './indicator-value-types';
