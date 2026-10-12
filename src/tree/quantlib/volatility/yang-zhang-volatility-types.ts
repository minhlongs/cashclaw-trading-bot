import type { OhlcBar } from './garman-klass-volatility-types';
export type { OhlcBar };

export interface YangZhangConfig {
  readonly bars?: readonly OhlcBar[];
  readonly annualizationFactor?: number;
}

export interface YangZhangResult {
  readonly overnightVariance: number;
  readonly openToCloseVariance: number;
  readonly rogersSatchellVariance: number;
  readonly compositeVariance: number;
  readonly annualizedVolatility: number;
  readonly optimalK: number;
  readonly rawVariance: number;
  readonly kFactor: number;
  readonly barCount: number;
}
