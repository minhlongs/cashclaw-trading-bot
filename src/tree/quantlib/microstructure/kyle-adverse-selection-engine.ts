import type {
  SignedOrderFlowTrade, KyleLambdaResult, KyleEngineConfig, AdverseSelectionLevel,
} from './kyle-adverse-selection-types';

export class KyleAdverseSelectionEngine {
  private readonly minObservations: number;
  private readonly highLambdaThreshold: number;
  private readonly criticalLambdaThreshold: number;

  constructor(config: KyleEngineConfig = {}) {
    this.minObservations = config.minObservations ?? 5;
    this.highLambdaThreshold = config.highLambdaThreshold ?? 0.02;
    this.criticalLambdaThreshold = config.criticalLambdaThreshold ?? 0.05;
  }

  estimateLambda(trades: readonly SignedOrderFlowTrade[]): KyleLambdaResult {
    if (trades.length < this.minObservations) return this.createFallbackResult(trades.length);

    const n = trades.length - 1;
    const deltaP: number[] = [];
    const signedQ: number[] = [];
    let netFlow = 0;

    for (let i = 1; i < trades.length; i++) {
      const prev = trades[i - 1];
      const curr = trades[i];
      if (!prev || !curr) continue;
      const dp = curr.price - prev.price;
      const q = curr.side === 'BUY' ? curr.quantity : -curr.quantity;
      deltaP.push(dp);
      signedQ.push(q);
      netFlow += q;
    }

    if (deltaP.length < this.minObservations - 1) return this.createFallbackResult(trades.length);

    const meanQ = signedQ.reduce((acc, v) => acc + v, 0) / n;
    const meanDp = deltaP.reduce((acc, v) => acc + v, 0) / n;
    let cov = 0, varQ = 0, varDp = 0;

    for (let i = 0; i < n; i++) {
      const qDiff = signedQ[i]! - meanQ;
      const dpDiff = deltaP[i]! - meanDp;
      cov += qDiff * dpDiff;
      varQ += qDiff * qDiff;
      varDp += dpDiff * dpDiff;
    }

    if (varQ < 1e-12 || varDp < 1e-12) return this.createFallbackResult(trades.length);

    const lambda = Math.max(0, cov / varQ);
    const rSquared = Math.max(0, Math.min(1, (cov * cov) / (varQ * varDp)));
    let sse = 0;
    for (let i = 0; i < n; i++) {
      const residual = deltaP[i]! - (meanDp + lambda * (signedQ[i]! - meanQ));
      sse += residual * residual;
    }

    const mse = sse / Math.max(1, n - 2);
    const seLambda = Math.sqrt(mse / varQ);
    const tStat = seLambda > 1e-12 ? lambda / seLambda : 0;

    return {
      lambda: Number(lambda.toFixed(6)), rSquared: Number(rSquared.toFixed(4)), tStat: Number(tStat.toFixed(4)),
      adverseSelectionRisk: this.classifyRisk(lambda), observationCount: trades.length,
      netSignedOrderFlow: Number(netFlow.toFixed(4)),
    };
  }

  private classifyRisk(lambda: number): AdverseSelectionLevel {
    if (lambda >= this.criticalLambdaThreshold) return 'CRITICAL';
    if (lambda >= this.highLambdaThreshold) return 'HIGH';
    if (lambda >= 0.005) return 'MEDIUM';
    return 'LOW';
  }

  private createFallbackResult(count: number): KyleLambdaResult {
    return {
      lambda: 0, rSquared: 0, tStat: 0, adverseSelectionRisk: 'LOW',
      observationCount: count, netSignedOrderFlow: 0,
    };
  }
}
