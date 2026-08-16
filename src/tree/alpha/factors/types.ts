// Factor analysis types for alpha signal decomposition.

/** A named time-series factor with aligned timestamps. */
export interface Factor {
  /** Factor identifier (e.g. 'momentum_12m', 'value_bp'). */
  name: string;
  /** Factor values aligned with observation timestamps. */
  values: number[];
  /** Unix timestamps (ms) aligned with values. */
  timestamps: number[];
}

/** Single-factor regression output. */
export interface FactorExposure {
  /** Factor name. */
  factor: string;
  /** Regression beta (slope) — exposure magnitude. */
  exposure: number;
  /** t-statistic for the beta estimate. */
  tStat: number;
  /** True when |tStat| > 2 (conventional significance threshold). */
  significant: boolean;
}

/** Multi-factor regression output. */
export interface FactorAnalysisResult {
  /** Per-factor exposure estimates. */
  exposures: FactorExposure[];
  /** Adjusted R-squared of the joint regression. */
  rSquared: number;
  /** Number of observations used. */
  nObs: number;
}
