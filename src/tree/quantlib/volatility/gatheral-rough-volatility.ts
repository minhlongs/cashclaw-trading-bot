export interface RoughVolatilityConfig {
  readonly minObservations: number;
  readonly maxLag: number;
  readonly roughThreshold: number;
}

export interface RoughVolatilityResult {
  readonly hurstExponent: number;
  readonly isRoughRegime: boolean;
  readonly fitQuality: number;
  readonly sampleCount: number;
}

export class GatheralRoughVolatilityEngine {
  private readonly config: RoughVolatilityConfig;

  constructor(config: Partial<RoughVolatilityConfig> = {}) {
    this.config = {
      minObservations: Math.max(10, config.minObservations ?? 20),
      maxLag: Math.max(2, config.maxLag ?? 6),
      roughThreshold: Math.max(0.05, Math.min(0.5, config.roughThreshold ?? 0.45)),
    };
  }

  estimateHurst(logVolatilities: readonly number[]): RoughVolatilityResult {
    const n = logVolatilities.length;
    if (n < this.config.minObservations) {
      return { hurstExponent: 0.5, isRoughRegime: false, fitQuality: 0, sampleCount: n };
    }

    const maxLag = Math.min(this.config.maxLag, Math.floor(n / 4));
    const lags: number[] = [];
    const logMoments: number[] = [];

    for (let lag = 1; lag <= maxLag; lag++) {
      let sumDiffSq = 0;
      let count = 0;
      for (let i = lag; i < n; i++) {
        const diff = logVolatilities[i] - logVolatilities[i - lag];
        sumDiffSq += diff * diff;
        count++;
      }
      if (count > 0 && sumDiffSq > 0) {
        lags.push(Math.log(lag));
        logMoments.push(Math.log(sumDiffSq / count));
      }
    }

    if (lags.length < 2) {
      return { hurstExponent: 0.5, isRoughRegime: false, fitQuality: 0, sampleCount: n };
    }

    const k = lags.length;
    const meanX = lags.reduce((a, b) => a + b, 0) / k;
    const meanY = logMoments.reduce((a, b) => a + b, 0) / k;

    let covXY = 0;
    let varX = 0;
    let varY = 0;

    for (let i = 0; i < k; i++) {
      const dx = lags[i] - meanX;
      const dy = logMoments[i] - meanY;
      covXY += dx * dy;
      varX += dx * dx;
      varY += dy * dy;
    }

    const slope = varX > 1e-9 ? covXY / varX : 1.0;
    const hurstExponent = Math.max(0.01, Math.min(0.99, Number((slope / 2).toFixed(4))));

    let fitQuality = 0;
    if (varX > 1e-9 && varY > 1e-9) {
      const r = covXY / Math.sqrt(varX * varY);
      fitQuality = Math.max(0, Math.min(1.0, Number((r * r).toFixed(4))));
    }

    return {
      hurstExponent,
      isRoughRegime: hurstExponent < this.config.roughThreshold,
      fitQuality,
      sampleCount: n,
    };
  }
}
