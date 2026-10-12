export interface RollSpreadConfig {
  priceChanges: readonly number[];
  referencePrice?: number;
}

export interface RollSpreadResult {
  serialCovariance: number;
  rollSpread: number;
  percentageSpread?: number;
  isPositiveCovariance: boolean;
}
