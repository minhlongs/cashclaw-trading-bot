export interface ChordiaImbalanceParams {
  readonly buyerVolume: number;
  readonly sellerVolume: number;
  readonly returnVolatility?: number;
  readonly baselineSpreadBps?: number;
  readonly imbalanceSensitivity?: number;
  readonly reversalCoefficient?: number;
}

export interface ChordiaImbalanceResult {
  readonly orderImbalanceShares: number;
  readonly orderImbalanceRatio: number;
  readonly dynamicSpreadBps: number;
  readonly expectedReversalBps: number;
  readonly adversePressureBps: number;
  readonly isLiquidityDrained: boolean;
}
