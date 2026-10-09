export interface LOBLevelDepth {
  readonly price: number;
  readonly volume: number;
  readonly orderCount: number;
}

export interface LOBQueueSnapshot {
  readonly bestBid: number;
  readonly bestAsk: number;
  readonly bidVolume: number;
  readonly askVolume: number;
  readonly queuePosition: number;
  readonly totalLevelVolume: number;
  readonly marketArrivalRate: number;
  readonly cancelRate: number;
}

export interface ContStoikovQueueResult {
  readonly fillProbability: number;
  readonly expectedWaitTimeMs: number;
  readonly microPrice: number;
  readonly midPrice: number;
  readonly orderFlowImbalance: number;
  readonly isDepletionLikely: boolean;
}
