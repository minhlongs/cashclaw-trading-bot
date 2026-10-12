export interface HighLowBar {
  readonly high: number;
  readonly low: number;
}

export interface ParkinsonConfig {
  readonly bars: readonly HighLowBar[];
  readonly annualizationFactor?: number;
}

export interface ParkinsonResult {
  readonly rawVariance: number;
  readonly annualizedVolatility: number;
  readonly barCount: number;
  readonly constantMultiplier: number;
}
