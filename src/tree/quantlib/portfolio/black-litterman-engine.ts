export interface AssetMarketPrior {
  readonly symbol: string;
  readonly marketWeight: number;
  readonly equilibriumReturn: number;
  readonly variance: number;
}

export interface QualitativeAgentView {
  readonly symbol: string;
  readonly expectedReturn: number;
  readonly confidence: number;
  readonly viewDescription?: string;
}

export interface BlackLittermanConfig {
  readonly riskAversionDelta?: number;
  readonly tauPriorUncertainty?: number;
}

export interface BlackLittermanAssetResult {
  readonly symbol: string;
  readonly priorReturn: number;
  readonly posteriorReturn: number;
  readonly optimalWeight: number;
  readonly viewTiltPct: number;
}

export interface BlackLittermanResult {
  readonly assets: readonly BlackLittermanAssetResult[];
  readonly totalTiltL1: number;
  readonly averageConfidence: number;
}

export class BlackLittermanEngine {
  private readonly delta: number;
  private readonly tau: number;

  constructor(config: BlackLittermanConfig = {}) {
    this.delta = config.riskAversionDelta ?? 2.5;
    this.tau = config.tauPriorUncertainty ?? 0.05;
  }

  computePosteriorWeights(
    priors: readonly AssetMarketPrior[],
    views: readonly QualitativeAgentView[] = [],
  ): BlackLittermanResult {
    if (priors.length === 0) return { assets: [], totalTiltL1: 0, averageConfidence: 0 };

    const viewMap = new Map<string, QualitativeAgentView>();
    let totalConfidence = 0;
    for (const v of views) {
      viewMap.set(v.symbol, v);
      totalConfidence += v.confidence;
    }
    const avgConfidence = views.length > 0 ? totalConfidence / views.length : 0;

    let totalTiltL1 = 0;
    const raw: Array<{ symbol: string; priorReturn: number; posteriorReturn: number; rawWeight: number; viewTiltPct: number }> = [];

    for (const p of priors) {
      const view = viewMap.get(p.symbol);
      let posteriorMu = p.equilibriumReturn;
      let viewTilt = 0;
      const safeVar = Math.max(1e-6, p.variance);

      if (view && view.confidence > 0) {
        const priorPrecision = 1 / (this.tau * safeVar);
        const omegaInv = view.confidence / safeVar;
        posteriorMu = (priorPrecision * p.equilibriumReturn + omegaInv * view.expectedReturn) / (priorPrecision + omegaInv);
        viewTilt = ((posteriorMu - p.equilibriumReturn) / Math.max(1e-4, Math.abs(p.equilibriumReturn))) * 100;
      }

      const rawWeight = Math.max(0, (posteriorMu * (1 / safeVar)) / this.delta);
      totalTiltL1 += Math.abs(viewTilt);
      raw.push({
        symbol: p.symbol,
        priorReturn: Number(p.equilibriumReturn.toFixed(6)),
        posteriorReturn: Number(posteriorMu.toFixed(6)),
        rawWeight,
        viewTiltPct: Number(viewTilt.toFixed(2)),
      });
    }

    const sumWeights = raw.reduce((acc, a) => acc + a.rawWeight, 0);
    const assets: BlackLittermanAssetResult[] = raw.map((a) => ({
      symbol: a.symbol,
      priorReturn: a.priorReturn,
      posteriorReturn: a.posteriorReturn,
      optimalWeight: Number((sumWeights > 0 ? a.rawWeight / sumWeights : 1 / priors.length).toFixed(4)),
      viewTiltPct: a.viewTiltPct,
    }));

    return { assets, totalTiltL1: Number(totalTiltL1.toFixed(2)), averageConfidence: Number(avgConfidence.toFixed(4)) };
  }
}
