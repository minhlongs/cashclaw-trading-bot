export interface ContDeLarrardQueueConfig {
  readonly queueDepth: number;
  readonly cancellationRate: number;
  readonly orderFlowIntensity: number;
  readonly highProbThreshold?: number;
}

export interface ContDeLarrardFillProbResult {
  readonly queuePosition: number;
  readonly queueDepth: number;
  readonly fillProbability: number;
  readonly gamma: number;
  readonly isHighExecutionProbability: boolean;
}
