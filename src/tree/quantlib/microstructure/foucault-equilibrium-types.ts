export interface FoucaultEquilibriumParams {
  readonly assetVolatility: number;
  readonly informedProportion: number;
  readonly holdingCost?: number;
  readonly orderArrivalRate?: number;
  readonly midPrice?: number;
}

export interface FoucaultEquilibriumResult {
  readonly halfSpread: number;
  readonly bid: number;
  readonly ask: number;
  readonly spread: number;
  readonly fillProbability: number;
  readonly winnersCurseBps: number;
  readonly marketOrderProb: number;
}
