// Types for multi-asset correlation analysis and pairs trading.

/** Statistics for a cointegrated or correlated pair. */
export interface PairStats {
  symbol1: string;
  symbol2: string;
  /** Pearson correlation coefficient over the lookback window. */
  correlation: number;
  /** Estimated half-life of mean reversion in periods. */
  halfLife: number;
  /** Mean of the OLS hedge-ratio spread. */
  spreadMean: number;
  /** Standard deviation of the spread. */
  spreadStd: number;
  /** P-value from the simplified Engle-Granger cointegration test. */
  cointegrationPValue: number;
}

/** Trade signal derived from a pair's spread z-score. */
export interface PairSignal {
  pair: [string, string];
  /** long_spread = buy pair1 / sell pair2; short_spread = inverse. */
  direction: 'long_spread' | 'short_spread';
  /** Current z-score of the spread. */
  zScore: number;
  /** Confidence score in [0, 1]. */
  confidence: number;
}

/** Options for generating pair trading signals. */
export interface GeneratePairSignalsOptions {
  /** Spread z-score absolute threshold for triggering a signal (default 2.0). */
  readonly zScoreThreshold?: number;
  /** Causal timestamp cutoff: only candles with timestamp < asOfTime are used. */
  readonly asOfTime?: number;
  /** Lookback window of candles to evaluate spread statistics over. */
  readonly lookback?: number;
}

/** Configuration for an end-to-end multi-pair scan. */
export interface MultiPairScanConfig {
  /** Lookback window of bars used for discovery and signal estimation. */
  readonly lookback: number;
  /** Minimum absolute Pearson correlation required to qualify (default 0.5). */
  readonly minCorrelation?: number;
  /** Minimum spread standard deviation for diversification (default 0.001). */
  readonly minSpreadStd?: number;
  /** Spread z-score threshold for signal emission (default 2.0). */
  readonly zScoreThreshold?: number;
  /** Causal timestamp cutoff: only candles strictly before asOfTime are consumed. */
  readonly asOfTime?: number;
}

/** Outcome of an end-to-end multi-pair scan. */
export interface MultiPairScanResult {
  /** All pairs passing correlation floor and Engle-Granger cointegration. */
  readonly candidatePairs: readonly PairStats[];
  /** Subset of candidate pairs satisfying minimum spread diversification. */
  readonly diversifiedPairs: readonly PairStats[];
  /** Trading signals emitted from the diversified pairs. */
  readonly signals: readonly PairSignal[];
}

