export interface FoucaultKadanParams {
  readonly queueDepth: number;
  readonly marketOrderArrivalRate: number;
  readonly traderImpatienceCost: number;
  readonly tickSize: number;
  readonly volatility: number;
  readonly timeLimitSec: number;
}

export interface FoucaultKadanResult {
  readonly expectedWaitTimeSec: number;
  readonly reservationSpread: number;
  readonly fillProbability: number;
  readonly optimalOrderType: 'LIMIT' | 'MARKET';
  readonly waitingCostPerUnit: number;
}
