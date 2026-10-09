export interface HasbrouckFosterSpreadParams {
  readonly transactionPrices: readonly number[];
  readonly quoteMidpoints?: readonly number[];
  readonly signedTradeVolumes?: readonly number[];
}

export interface HasbrouckFosterSpreadResult {
  readonly effectiveSpread: number;
  readonly buyImpact: number;
  readonly sellImpact: number;
  readonly asymmetryIndex: number;
  readonly orderProcessingRatio: number;
  readonly sampleSize: number;
}
