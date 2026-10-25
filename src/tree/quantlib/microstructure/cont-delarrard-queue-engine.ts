export class ContDeLarrardQueueEngine {
  private readonly config: ContDeLarrardQueueConfig;
  private readonly defaultThreshold = 0.65;

  constructor(config: ContDeLarrardQueueConfig) {
    this.config = {
      ...config,
      queueDepth: Math.max(1, config.queueDepth),
      cancellationRate: Math.max(0, config.cancellationRate),
      orderFlowIntensity: Math.max(1e-6, config.orderFlowIntensity),
    };
  }

  computeFillProbability(queuePosition: number): ContDeLarrardFillProbResult {
    const L = this.config.queueDepth;
    const x = Math.max(0, Math.min(L, queuePosition));
    const delta = this.config.cancellationRate;
    const D = this.config.orderFlowIntensity;
    const gamma = Math.sqrt(delta / D);

    let fillProb = 0;
    if (x === 0) {
      fillProb = 1.0;
    } else if (x === L) {
      fillProb = 0.0;
    } else if (gamma < 1e-5) {
      fillProb = (L - x) / L;
    } else {
      const numerator = Math.sinh(gamma * (L - x));
      const denominator = Math.sinh(gamma * L);
      fillProb = denominator > 0 ? numerator / denominator : (L - x) / L;
    }

    fillProb = Math.max(0, Math.min(1, fillProb));
    const threshold = this.config.highProbThreshold ?? this.defaultThreshold;

    return {
      queuePosition: x,
      queueDepth: L,
      fillProbability: Number(fillProb.toFixed(6)),
      gamma: Number(gamma.toFixed(6)),
      isHighExecutionProbability: fillProb >= threshold,
    };
  }
}

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
