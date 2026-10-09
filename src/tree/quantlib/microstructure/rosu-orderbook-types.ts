export interface RosuOrderBookParams {
  readonly arrivalIntensity: number;
  readonly impatienceDiscountRate: number;
  readonly tickSize: number;
  readonly orderSize: number;
  readonly volatility: number;
  readonly depthLevels?: number;
}

export interface RosuOrderBookResult {
  readonly equilibriumSpread: number;
  readonly probLimitFillBeforeCancel: number;
  readonly expectedWaitingTimeSec: number;
  readonly immediacyPremiumBps: number;
  readonly depthProfile: readonly number[];
}
