export interface RollSpreadParams {
  readonly priceSeries: readonly number[];
  readonly tickSize?: number;
}

export interface RollSpreadResult {
  readonly autocovariance: number;
  readonly rollSpread: number;
  readonly effectiveSpreadPct: number;
  readonly isAutocovarianceNegative: boolean;
  readonly numObservations: number;
}
