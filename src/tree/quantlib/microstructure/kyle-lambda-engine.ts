export class KyleLambdaEngine {
  private readonly config: KyleLambdaConfig;

  constructor(config: Partial<KyleLambdaConfig> = {}) {
    this.config = {
      minObservations: Math.max(3, config.minObservations ?? 5),
      varianceFloor: Math.max(1e-9, config.varianceFloor ?? 1e-6),
      adverseSelectionThreshold: Math.max(1e-4, config.adverseSelectionThreshold ?? 0.05),
    };
  }

  estimateLambda(observations: readonly KyleOrderFlowObservation[]): KyleLambdaResult {
    const n = observations.length;
    if (n < this.config.minObservations) {
      return {
        lambda: 0,
        rSquared: 0,
        isInformedFlowDominant: false,
        sampleCount: n,
      };
    }

    let sumQ = 0;
    let sumDP = 0;
    for (const obs of observations) {
      sumQ += obs.orderFlow;
      sumDP += obs.priceChange;
    }
    const meanQ = sumQ / n;
    const meanDP = sumDP / n;

    let covQDP = 0;
    let varQ = 0;
    let varDP = 0;

    for (const obs of observations) {
      const devQ = obs.orderFlow - meanQ;
      const devDP = obs.priceChange - meanDP;
      covQDP += devQ * devDP;
      varQ += devQ * devQ;
      varDP += devDP * devDP;
    }

    const effectiveVarQ = Math.max(this.config.varianceFloor, varQ);
    const lambda = covQDP / effectiveVarQ;

    // R-squared computation
    const totalSS = varDP;
    let rSquared = 0;
    if (totalSS > this.config.varianceFloor) {
      const r = covQDP / Math.sqrt(effectiveVarQ * totalSS);
      rSquared = Math.max(0, Math.min(1.0, r * r));
    }

    const isInformedFlowDominant =
      lambda >= this.config.adverseSelectionThreshold && rSquared >= 0.2;

    return {
      lambda: Number(lambda.toFixed(6)),
      rSquared: Number(rSquared.toFixed(4)),
      isInformedFlowDominant,
      sampleCount: n,
    };
  }
}

export interface KyleOrderFlowObservation {
  readonly orderFlow: number; // Signed order flow Q (positive for buy, negative for sell)
  readonly priceChange: number; // Delta P (P_t - P_{t-1})
}

export interface KyleLambdaConfig {
  readonly minObservations: number;
  readonly varianceFloor: number;
  readonly adverseSelectionThreshold: number;
}

export interface KyleLambdaResult {
  readonly lambda: number; // Adverse selection price impact parameter
  readonly rSquared: number; // Explanatory power of order flow on price change
  readonly isInformedFlowDominant: boolean; // Flag if lambda exceeds adverse selection threshold
  readonly sampleCount: number;
}
