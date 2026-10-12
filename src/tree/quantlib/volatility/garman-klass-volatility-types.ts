export interface OhlcBar {
  readonly open: number;
  readonly high: number;
  readonly low: number;
  readonly close: number;
}

export interface GarmanKlassConfig {
  readonly bars?: readonly OhlcBar[];
  readonly annualizationFactor?: number;
}

export interface GarmanKlassResult {
  readonly parkinsonVariance: number;
  readonly parkinsonVolatility: number;
  readonly garmanKlassVariance: number;
  readonly garmanKlassVolatility: number;
  readonly gkyzVariance: number;
  readonly gkyzVolatility: number;
  readonly rawVariance: number;
  readonly annualizedVolatility: number;
  readonly barCount: number;
  readonly efficiencyGain: number;
}
