export interface OhlcBar {
  readonly open: number;
  readonly high: number;
  readonly low: number;
  readonly close: number;
}

export interface GarmanKlassConfig {
  readonly annualizationFactor?: number;
}

export interface GarmanKlassResult {
  readonly parkinsonVariance: number;
  readonly parkinsonVolatility: number;
  readonly garmanKlassVariance: number;
  readonly garmanKlassVolatility: number;
  readonly gkyzVariance: number;
  readonly gkyzVolatility: number;
}
