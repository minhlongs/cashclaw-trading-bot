import type { ComposedAlpha } from '../composition/types';
import type { PortfolioConfig, RiskInputs } from './types';
import { applyBetaExposure, applyCorrelatedBucket, applyDrawdownDeRisk, applyGrossExposure, applyNetExposure, applyPositionCap, applyTurnoverConstraint, applyVolTarget, type OverlayResult } from './constraints';

export interface EngineScoredAlpha {
  readonly alpha: ComposedAlpha;
  readonly score: number;
}

export function baseWeights(scored: readonly EngineScoredAlpha[]): ReadonlyMap<string, number> {
  const w = new Map<string, number>();
  for (const { alpha, score } of scored) {
    const dir = alpha.direction === 'sell' ? -1 : 1;
    w.set(alpha.alphaId, score * dir * alpha.confidence);
  }
  return w;
}

export function applySequentialOverlays(
  initialWeights: ReadonlyMap<string, number>,
  currentWeights: ReadonlyMap<string, number>,
  risk: RiskInputs,
  cfg: PortfolioConfig,
): { weights: ReadonlyMap<string, number>; adjustments: string[] } {
  const adjustments: string[] = [];
  let w = initialWeights;
  const run = (r: OverlayResult): void => { w = r.weights; if (r.adjustment !== null) adjustments.push(r.adjustment); };

  run(applyVolTarget(w, risk.realizedVolatility, cfg.targetVolatility));
  run(applyPositionCap(w, cfg.maxPositionWeight));
  run(applyGrossExposure(w, cfg.maxGrossExposure));
  run(applyNetExposure(w, cfg.maxNetExposure));
  run(applyCorrelatedBucket(w, risk.correlationMatrix, cfg.correlationBucketThreshold, cfg.maxCorrelatedExposure));
  run(applyBetaExposure(w, risk.betas, cfg.maxBetaExposure));
  run(applyTurnoverConstraint(w, currentWeights, cfg.maxTurnover));
  run(applyDrawdownDeRisk(w, risk.currentDrawdown, cfg.drawdownThreshold, cfg.deRiskFactor));
  return { weights: w, adjustments };
}
