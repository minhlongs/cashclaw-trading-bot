export interface OhlcBar {
  readonly open: number;
  readonly high: number;
  readonly low: number;
  readonly close: number;
}

export interface RogersSatchellConfig {
  readonly bars?: readonly OhlcBar[];
  readonly annualizationFactor?: number;
}

export interface RogersSatchellResult {
  readonly rawVariance: number;
  readonly annualizedVolatility: number;
  readonly barCount: number;
  readonly driftIndependent: boolean;
}
