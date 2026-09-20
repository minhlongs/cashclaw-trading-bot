// Multiple-Testing Defense — Statistical Safeguard Types
// Pure domain types: no I/O, no randomness, no Node APIs.

/** Percentile bootstrap confidence interval for a statistic. */
export interface BootstrapCiResult {
  /** Lower percentile bound of the CI. */
  readonly lower: number;
  /** Point estimate computed on the full sample. */
  readonly point: number;
  /** Upper percentile bound of the CI. */
  readonly upper: number;
  /** Number of resamples actually drawn. */
  readonly iterations: number;
}

/** A statistic computed over a sample (e.g. mean expectancy). */
export type StatFn = (values: readonly number[]) => number;

/** Options for `bootstrapCi`. */
export interface BootstrapOptions {
  /** Number of resamples (must be >= 1). */
  readonly iterations: number;
  /** Confidence level in (0, 1), e.g. 0.95. */
  readonly confidence: number;
  /** Explicit PRNG seed (reproducibility requirement). */
  readonly seed: number;
}

/** Permutation test of strategy-vs-signal alignment. */
export interface PermutationTestResult {
  /** Statistic on the observed (unaligned) pairing. */
  readonly observed: number;
  /** Mean of the statistic across shuffled alignments. */
  readonly nullMean: number;
  /** Standard deviation of the null distribution. */
  readonly nullStd: number;
  /** Fraction of permutations with statistic >= observed. */
  readonly pValue: number;
  /** Number of permutations actually drawn. */
  readonly iterations: number;
}

/** Options for `permutationTest`. */
export interface PermutationOptions {
  /** Number of permutations (must be >= 1). */
  readonly iterations: number;
  /** Explicit PRNG seed (reproducibility requirement). */
  readonly seed: number;
}

/** Verdict of the strategy-vs-random-entry comparison. */
export interface RandomEntryVerdict {
  readonly passes: boolean;
  readonly reason: string;
}

/** Options for `compareAgainstRandomEntry`. */
export interface RandomEntryComparisonOptions {
  /** Minimum expectancy edge over the baseline (same units as expectancy). */
  readonly minEdge?: number;
}

/** Options for `assessWalkForwardConsistency`. */
export interface WalkForwardConsistencyOptions {
  /** Minimum fraction of OOS windows with positive test metric. */
  readonly minPositiveFraction: number;
  /** Maximum allowed sign flips of the test metric across windows. */
  readonly maxSignFlips: number;
}

/** Verdict of the walk-forward consistency check. */
export interface WalkForwardConsistencyVerdict {
  /** Fraction of OOS windows with a positive test metric. */
  readonly positiveFraction: number;
  /** Number of sign flips of the test metric across windows. */
  readonly signFlips: number;
  /** OOS/IS degradation ratio from the walk-forward summary. */
  readonly degradationRatio: number;
  /** True when the strategy is consistent across OOS windows. */
  readonly consistent: boolean;
}

/** Options for `assessCrossAssetConsistency`. */
export interface CrossAssetConsistencyOptions {
  /** Minimum fraction of assets with positive expectancy net of costs. */
  readonly minPositiveFraction: number;
  /** Minimum number of assets that must be tested. */
  readonly minAssets: number;
}

/** Verdict of the cross-asset consistency check. */
export interface CrossAssetConsistencyVerdict {
  /** Number of assets tested (one report per asset). */
  readonly assetsTested: number;
  /** Number of assets with positive expectancy net of costs. */
  readonly assetsPassed: number;
  /** Fraction of assets with positive expectancy net of costs. */
  readonly positiveFraction: number;
  /** True when breadth and positive fraction both meet thresholds. */
  readonly consistent: boolean;
}
