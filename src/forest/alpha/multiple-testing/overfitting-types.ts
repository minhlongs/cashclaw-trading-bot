// Multiple-Testing Defense — Overfitting Proxy Types
// Types for the deterministic overfitting proxies (PBO + parameter
// sensitivity) and their combined report. Split from types.ts to keep
// files within the 200-line standard.

/** One configuration's metric across a grid (rows of the sensitivity input). */
export interface GridResult {
  /** Parameter values identifying the configuration. */
  readonly params: readonly number[];
  /** Metric value (e.g. OOS expectancy) for this configuration. */
  readonly metric: number;
}

/** Options for `parameterSensitivity`. */
export interface ParameterSensitivityOptions {
  /** Normalized-spread ceiling above which the strategy is sensitive. */
  readonly maxNormalizedSpread?: number;
}

/** Result of `parameterSensitivity` over a config grid. */
export interface ParameterSensitivityResult {
  /** Largest metric delta between neighboring configurations. */
  readonly maxDelta: number;
  /** Spread normalized by the metric range (0 when range is zero). */
  readonly normalizedSpread: number;
  /** True when the metric is unstable across neighboring configs. */
  readonly sensitive: boolean;
}

/** Result of the CSCV-style probability-of-backtest-overfitting proxy. */
export interface PboProxyResult {
  /** Fraction of IS-best configs finishing below-median OOS. */
  readonly pbo: number;
  /** Number of configurations in the matrix. */
  readonly configs: number;
  /** Number of OOS windows (columns) in the matrix. */
  readonly windows: number;
}

/** Combined overfitting assessment (PBO proxy + parameter sensitivity). */
export interface OverfittingReport {
  /** CSCV-style probability-of-backtest-overfitting proxy. */
  readonly pbo: PboProxyResult;
  /** Metric stability across neighboring configurations. */
  readonly sensitivity: ParameterSensitivityResult;
  /** True when either signal indicates overfitting risk. */
  readonly overfittingRisk: boolean;
}
