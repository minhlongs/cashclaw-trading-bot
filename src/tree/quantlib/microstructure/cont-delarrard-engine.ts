export class ContDeLarrardEngine {
  public static calculate(config: ContDeLarrardConfig): ContDeLarrardResult {
    const { bidQueueSize: qb, askQueueSize: qa } = config;
    if (qb < 0 || qa < 0) throw new Error('Queue sizes must be non-negative');
    if (qb === 0 && qa === 0) throw new Error('At least one queue must be non-empty');
    const lambda = config.arrivalRate ?? 10;
    const mu = config.cancellationRate ?? 5;
    const theta = config.marketOrderRate ?? 5;
    const total = qb + qa;
    const imb = total > 0 ? (qb - qa) / total : 0;
    const sigma2 = Math.max(0.1, lambda + mu + theta);
    const pUp = total > 0 ? qb / total : 0.5;
    const pDown = 1 - pUp;
    const expTime = (qb * qa) / sigma2;
    return {
      probPriceIncrease: Number(pUp.toFixed(6)),
      probPriceDecrease: Number(pDown.toFixed(6)),
      expectedDepletionTime: Number(expTime.toFixed(4)),
      queueImbalance: Number(imb.toFixed(6)),
    };
  }
}

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
