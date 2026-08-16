// Regime engine types — classify market conditions from candle data

export enum RegimeLabel {
  TREND_UP = 'TREND_UP',
  TREND_DOWN = 'TREND_DOWN',
  RANGE = 'RANGE',
  HIGH_VOLATILITY = 'HIGH_VOLATILITY',
  LOW_VOLATILITY = 'LOW_VOLATILITY',
  SHOCK = 'SHOCK',
  UNKNOWN = 'UNKNOWN',
}

export interface RegimeFeatures {
  /** Standard deviation of log returns over lookback window */
  realizedVol: number;
  /** Average True Range over lookback window */
  atr: number;
  /** ADX-like trend strength measure (0–100) */
  trendStrength: number;
  /** Slope of SMA over lookback (normalized) */
  maSlope: number;
  /** Standard deviation of cross-candle returns */
  returnDispersion: number;
  /** Z-score of current volume vs lookback mean */
  volumeAbnormality: number;
}

export interface RegimeResult {
  label: RegimeLabel;
  confidence: number;
  features: RegimeFeatures;
  timestamp: number;
  previousLabel: RegimeLabel | null;
  /** Number of consecutive periods in current regime */
  duration: number;
}

export interface RegimeConfig {
  /** Minimum candle count before producing a result */
  minCandles: number;
  /** Confidence threshold for non-UNKNOWN labels */
  confidenceThreshold: number;
  /** Lookback window size (in candles) */
  lookback: number;
  /** Minimum duration (in periods) before switching regime */
  minDuration: number;
}

export interface RegimeClassifier {
  classify(features: RegimeFeatures, config: RegimeConfig): RegimeResult;
}

export type RegimeHistory = RegimeResult[];
