// Multivariate Johansen Cointegration Types
// Models cointegrating relations, trace & max-eigenvalue statistics, and critical values.

export interface JohansenSeriesInput {
  /** Matrix of price series of dimension T x K, where T is time points and K is assets. */
  readonly prices: readonly (readonly number[])[];
  /** Optional asset tickers or identifiers. */
  readonly symbols?: readonly string[];
}

export interface JohansenTestResult {
  /** Cointegration rank r detected at 95% confidence level. */
  readonly rank: number;
  /** Estimated eigenvalues sorted descending. */
  readonly eigenvalues: readonly number[];
  /** Trace test statistics for r = 0, 1, ..., K-1. */
  readonly traceStats: readonly number[];
  /** Maximum eigenvalue statistics for r = 0, 1, ..., K-1. */
  readonly maxEigenStats: readonly number[];
  /** 95% critical values for Trace test. */
  readonly traceCriticalValues95: readonly number[];
  /** 95% critical values for Max Eigenvalue test. */
  readonly maxEigenCriticalValues95: readonly number[];
  /** Primary cointegrating vector beta normalized such that beta[0] = 1. */
  readonly cointegratingVector: readonly number[];
  /** Estimated Ornstein-Uhlenbeck mean-reverting half-life in bars. */
  readonly halfLifeBars: number;
  /** True if cointegration is established at 95% level (rank >= 1). */
  readonly isCointegrated: boolean;
}
