export interface BipowerVariationConfig {
  readonly minObservations?: number;
  readonly zCriticalThreshold?: number;
}

export interface BipowerVariationResult {
  readonly sampleCount: number;
  readonly realizedVariance: number;
  readonly bipowerVariation: number;
  readonly jumpVariation: number;
  readonly relativeJumpRatio: number;
  readonly jumpZScore: number;
  readonly hasSignificantJump: boolean;
}

export class BipowerVariationEngine {
  private readonly minObservations: number;
  private readonly zCriticalThreshold: number;
  private static readonly MU1_INV_SQ = Math.PI / 2;
  private static readonly ASYMPTOTIC_COEFF = Math.PI ** 2 / 4 + Math.PI - 5;

  constructor(config: BipowerVariationConfig = {}) {
    this.minObservations = Math.max(5, config.minObservations ?? 10);
    this.zCriticalThreshold = config.zCriticalThreshold ?? 1.96;
  }

  detectJumps(returns: readonly number[]): BipowerVariationResult {
    const n = returns.length;
    if (n < this.minObservations) {
      return {
        sampleCount: n,
        realizedVariance: 0,
        bipowerVariation: 0,
        jumpVariation: 0,
        relativeJumpRatio: 0,
        jumpZScore: 0,
        hasSignificantJump: false,
      };
    }

    let rv = 0;
    for (const r of returns) rv += r * r;

    let bvSum = 0;
    for (let i = 1; i < n; i++) {
      bvSum += Math.abs(returns[i - 1]!) * Math.abs(returns[i]!);
    }
    const bv = BipowerVariationEngine.MU1_INV_SQ * bvSum;
    const jv = Math.max(0, rv - bv);
    const relativeJump = rv > 0 ? jv / rv : 0;

    let tqSum = 0;
    for (let i = 2; i < n; i++) {
      const p1 = Math.pow(Math.abs(returns[i - 2]!), 4 / 3);
      const p2 = Math.pow(Math.abs(returns[i - 1]!), 4 / 3);
      const p3 = Math.pow(Math.abs(returns[i]!), 4 / 3);
      tqSum += p1 * p2 * p3;
    }
    const tq = n * 1.7408 * tqSum;
    const bvSq = bv * bv;
    const ratio = bvSq > 0 ? Math.max(1, tq / bvSq) : 1;
    const stdDev = Math.sqrt((BipowerVariationEngine.ASYMPTOTIC_COEFF / n) * ratio);
    const zScore = stdDev > 0 ? (rv - bv) / (rv * stdDev) : 0;

    return {
      sampleCount: n,
      realizedVariance: Number(rv.toFixed(8)),
      bipowerVariation: Number(bv.toFixed(8)),
      jumpVariation: Number(jv.toFixed(8)),
      relativeJumpRatio: Number(relativeJump.toFixed(6)),
      jumpZScore: Number(zScore.toFixed(4)),
      hasSignificantJump: zScore >= this.zCriticalThreshold,
    };
  }
}
