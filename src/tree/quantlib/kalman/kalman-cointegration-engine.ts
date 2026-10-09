import type {
  KalmanPairObservation,
  KalmanFilterConfig,
  KalmanState,
} from './kalman-cointegration-types';

export class KalmanCointegrationEngine {
  private beta = 1.0;
  private alpha = 0.0;
  private pMatrix: [number, number, number, number] = [10, 0, 0, 10];
  private readonly delta: number;
  private readonly rVariance: number;
  private readonly errorHistory: number[] = [];

  constructor(config: KalmanFilterConfig = {}) {
    this.delta = config.delta ?? 1e-4;
    this.rVariance = config.rVariance ?? 1e-3;
  }

  update(obs: KalmanPairObservation): KalmanState {
    const qVariance = this.delta / (1 - this.delta);
    let p00 = this.pMatrix[0] + qVariance;
    let p01 = this.pMatrix[1];
    let p10 = this.pMatrix[2];
    let p11 = this.pMatrix[3] + qVariance;

    const y = obs.priceY;
    const x = obs.priceX;

    const yPred = x * this.beta + this.alpha;
    const error = y - yPred;
    this.errorHistory.push(error);
    if (this.errorHistory.length > 100) {
      this.errorHistory.shift();
    }

    const hp0 = x * p00 + p10;
    const hp1 = x * p01 + p11;
    const s = x * hp0 + hp1 + this.rVariance;

    const kBeta = (x * p00 + p01) / s;
    const kAlpha = (x * p10 + p11) / s;

    this.beta += kBeta * error;
    this.alpha += kAlpha * error;

    p00 -= kBeta * hp0;
    p01 -= kBeta * hp1;
    p10 -= kAlpha * hp0;
    p11 -= kAlpha * hp1;

    this.pMatrix = [p00, p01, p10, p11];

    const halfLife = this.estimateHalfLife();

    return {
      beta: Number(this.beta.toFixed(6)),
      alpha: Number(this.alpha.toFixed(6)),
      error: Number(error.toFixed(6)),
      qVariance: Number(qVariance.toFixed(8)),
      halfLifeBars: Number(halfLife.toFixed(2)),
    };
  }

  private estimateHalfLife(): number {
    const n = this.errorHistory.length;
    if (n < 5) return 0;

    let sumX = 0;
    let sumY = 0;
    let sumXX = 0;
    let sumXY = 0;
    const m = n - 1;

    for (let i = 0; i < m; i++) {
      const ePrev = this.errorHistory[i] ?? 0;
      const deltaE = (this.errorHistory[i + 1] ?? 0) - ePrev;
      sumX += ePrev;
      sumY += deltaE;
      sumXX += ePrev * ePrev;
      sumXY += ePrev * deltaE;
    }

    const denom = m * sumXX - sumX * sumX;
    if (Math.abs(denom) < 1e-12) return 0;

    const lambda = (m * sumXY - sumX * sumY) / denom;
    if (lambda >= 0) return 0; // Not mean-reverting

    return Math.log(2) / -lambda;
  }
}
