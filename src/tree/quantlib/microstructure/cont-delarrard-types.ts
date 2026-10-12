export interface ContDeLarrardConfig {
  readonly bidQueueSize: number;
  readonly askQueueSize: number;
  readonly arrivalRate?: number;
  readonly cancellationRate?: number;
  readonly marketOrderRate?: number;
}

export interface ContDeLarrardResult {
  readonly probPriceIncrease: number;
  readonly probPriceDecrease: number;
  readonly expectedDepletionTime: number;
  readonly queueImbalance: number;
}
