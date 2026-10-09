import type {
  AssetMarketPrior,
  QualitativeAgentView,
  BlackLittermanConfig,
  BlackLittermanResult,
  BlackLittermanAssetResult,
} from './black-litterman-types';

export class BlackLittermanEngine {
  private readonly delta: number;
  private readonly tau: number;

  constructor(config: BlackLittermanConfig = {}) {
    this.delta = config.riskAversionDelta ?? 2.5;
    this.tau = config.tauPriorUncertainty ?? 0.05;
  }

  computePosteriorWeights(
    priors: readonly AssetMarketPrior[],
    views: readonly QualitativeAgentView[] = []
  ): BlackLittermanResult {
    if (priors.length === 0) {
      return { assets: [], totalTiltL1: 0, averageConfidence: 0 };
    }

    const viewMap = new Map<string, QualitativeAgentView>();
    let totalConfidence = 0;
    for (const v of views) {
      viewMap.set(v.symbol, v);
      totalConfidence += v.confidence;
    }
    const avgConfidence = views.length > 0 ? totalConfidence / views.length : 0;

    let totalTiltL1 = 0;
    const rawAssetResults: Array<{
      symbol: string;
      priorReturn: number;
      posteriorReturn: number;
      rawWeight: number;
      viewTiltPct: number;
    }> = [];

    for (const p of priors) {
      const view = viewMap.get(p.symbol);
      let posteriorMu = p.equilibriumReturn;
      let viewTilt = 0;

      if (view && view.confidence > 0) {
        const priorVar = this.tau * Math.max(1e-6, p.variance);
        const omegaInv = view.confidence / Math.max(1e-6, p.variance);
        const priorPrecision = 1 / priorVar;

        const posteriorPrecision = priorPrecision + omegaInv;
        posteriorMu = (priorPrecision * p.equilibriumReturn + omegaInv * view.expectedReturn) / posteriorPrecision;
        viewTilt = ((posteriorMu - p.equilibriumReturn) / Math.max(1e-4, Math.abs(p.equilibriumReturn))) * 100;
      }

      const invVar = 1 / Math.max(1e-6, p.variance);
      const rawOptimalWeight = Math.max(0, (posteriorMu * invVar) / this.delta);

      totalTiltL1 += Math.abs(viewTilt);
      rawAssetResults.push({
        symbol: p.symbol,
        priorReturn: Number(p.equilibriumReturn.toFixed(6)),
        posteriorReturn: Number(posteriorMu.toFixed(6)),
        rawWeight: rawOptimalWeight,
        viewTiltPct: Number(viewTilt.toFixed(2)),
      });
    }

    const sumWeights = rawAssetResults.reduce((acc, a) => acc + a.rawWeight, 0);
    const assets: BlackLittermanAssetResult[] = rawAssetResults.map((a) => ({
      symbol: a.symbol,
      priorReturn: a.priorReturn,
      posteriorReturn: a.posteriorReturn,
      optimalWeight: Number((sumWeights > 0 ? a.rawWeight / sumWeights : 1 / priors.length).toFixed(4)),
      viewTiltPct: a.viewTiltPct,
    }));

    return {
      assets,
      totalTiltL1: Number(totalTiltL1.toFixed(2)),
      averageConfidence: Number(avgConfidence.toFixed(4)),
    };
  }
}
