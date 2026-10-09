export interface BiaisHillionSpattParams {
  readonly spreadTicks: number;
  readonly bidDepth: number;
  readonly askDepth: number;
  readonly baseArrivalRate: number;
  readonly spreadSensitivity: number;
  readonly depthSensitivity: number;
}

export interface BiaisHillionSpattResult {
  readonly probLimitOrderAtTouch: number;
  readonly probMarketOrder: number;
  readonly probCancellation: number;
  readonly liquidityReplenishmentRate: number;
  readonly spreadWideningRisk: number;
  readonly resiliencyHalfLife: number;
}
