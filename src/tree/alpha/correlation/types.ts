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
