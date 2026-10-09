export interface AsynchronousTick {
  readonly timestampMs: number;
  readonly price: number;
}

export interface HayashiYoshidaConfig {
  readonly maxLagMs?: number;
  readonly lagStepMs?: number;
  readonly minObservations?: number;
}

export interface HayashiYoshidaLagMetrics {
  readonly lagMs: number;
  readonly covariance: number;
  readonly correlation: number;
}

export interface HayashiYoshidaResult {
  readonly optimalLagMs: number;
  readonly peakCorrelation: number;
  readonly instantaneousCorrelation: number;
  readonly isLeader: boolean;
  readonly allLagMetrics: readonly HayashiYoshidaLagMetrics[];
}
