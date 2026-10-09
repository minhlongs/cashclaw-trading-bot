export interface OhlcBar {
  readonly open: number;
  readonly high: number;
  readonly low: number;
  readonly close: number;
}

export interface YangZhangConfig {
  readonly annualizationFactor?: number;
}

export interface YangZhangResult {
  readonly overnightVariance: number;
  readonly openToCloseVariance: number;
  readonly rogersSatchellVariance: number;
  readonly compositeVariance: number;
  readonly annualizedVolatility: number;
  readonly optimalK: number;
}
