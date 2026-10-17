export interface LesmondLotConfig {
  readonly returns: readonly number[];
  readonly zeroTolerance?: number;
}

export interface LesmondLotResult {
  readonly zeroReturnProportion: number;
  readonly buyThresholdAlpha2: number;
  readonly sellThresholdAlpha1: number;
  readonly roundTripCost: number;
  readonly latentVolatility: number;
  readonly sampleDays: number;
}
