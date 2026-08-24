/**
 * Deterministic portfolio construction engine (Mission §7).
 *
 * Consumes scored alphas from composition scoring and produces target
 * weights by applying risk overlays SEQUENTIALLY in fixed order:
 *   1. base weight      = score × direction × confidence
 *   2. volatility target: scale so Σ|w| × realizedVol ≈ targetVolatility
 *   3. position cap     : clip any single |w| to maxPositionWeight
 *   4. gross exposure   : scale if Σ|w| > maxGrossExposure
 *   4b. net exposure    : scale if |Σw| > maxNetExposure
 *   5. correlated bucket: scale buckets (corr ≥ threshold) to maxCorrelatedExposure
 *   6. beta exposure    : scale if |Σ(w×β)| > maxBetaExposure (null β excluded,
 *                         flagged — never silently assumed)
 *   7. turnover         : scale delta vs currentWeights to maxTurnover
 *   8. drawdown de-risk : multiply by deRiskFactor when beyond threshold
 *
 * Every overlay that binds appends one line to riskAdjustments with numbers.
 * Purely deterministic: no solver, no randomness, no clock.
 */

import type { ComposedAlpha } from '../composition/types';
import type { PortfolioConfig, PortfolioPosition, PortfolioResult, RiskInputs } from './types';
import {
  applyBetaExposure,
  applyCorrelatedBucket,
  applyDrawdownDeRisk,
  applyGrossExposure,
  applyNetExposure,
  applyPositionCap,
  applyTurnoverConstraint,
  applyVolTarget,
  type OverlayResult,
} from './constraints';

/** A composed alpha that survived scoring, with its net-edge score. */
export interface EngineScoredAlpha {
  readonly alpha: ComposedAlpha;
  readonly score: number;
}

/** Overlay 1 — base weight = score × direction × confidence. */
function baseWeights(scored: readonly EngineScoredAlpha[]): ReadonlyMap<string, number> {
  const w = new Map<string, number>();
  for (const { alpha, score } of scored) {
    const dir = alpha.direction === 'sell' ? -1 : 1;
    w.set(alpha.alphaId, score * dir * alpha.confidence);
  }
  return w;
}

/**
 * Build target portfolio weights from scored alphas under sequential
 * risk overlays. Input order of `scoredAlphas` is preserved in output
 * positions (callers pass ranking output for deterministic order).
 */
export function buildPortfolio(
  scoredAlphas: readonly EngineScoredAlpha[],
  currentWeights: ReadonlyMap<string, number>,
  riskInputs: RiskInputs,
  config: PortfolioConfig,
): PortfolioResult {
  const adjustments: string[] = [];

  let weights = baseWeights(scoredAlphas);

  const runOverlay = (r: OverlayResult): void => {
    weights = r.weights;
    if (r.adjustment !== null) adjustments.push(r.adjustment);
  };

  runOverlay(applyVolTarget(weights, riskInputs.realizedVolatility, config.targetVolatility));
  runOverlay(applyPositionCap(weights, config.maxPositionWeight));
  runOverlay(applyGrossExposure(weights, config.maxGrossExposure));
  runOverlay(applyNetExposure(weights, config.maxNetExposure));
  runOverlay(
    applyCorrelatedBucket(
      weights,
      riskInputs.correlationMatrix,
      config.correlationBucketThreshold,
      config.maxCorrelatedExposure,
    ),
  );
  runOverlay(applyBetaExposure(weights, riskInputs.betas, config.maxBetaExposure));
  runOverlay(applyTurnoverConstraint(weights, currentWeights, config.maxTurnover));
  runOverlay(
    applyDrawdownDeRisk(
      weights,
      riskInputs.currentDrawdown,
      config.drawdownThreshold,
      config.deRiskFactor,
    ),
  );

  const positions: PortfolioPosition[] = scoredAlphas.map(({ alpha }) => ({
    alphaId: alpha.alphaId,
    targetWeight: weights.get(alpha.alphaId) ?? 0,
    turnover: Math.abs((weights.get(alpha.alphaId) ?? 0) - (currentWeights.get(alpha.alphaId) ?? 0)),
  }));

  let grossExposure = 0;
  let netExposure = 0;
  for (const w of weights.values()) {
    grossExposure += Math.abs(w);
    netExposure += w;
  }

  const turnoverIds = new Set([...weights.keys(), ...currentWeights.keys()]);
  let totalTurnover = 0;
  for (const id of turnoverIds) {
    totalTurnover += Math.abs((weights.get(id) ?? 0) - (currentWeights.get(id) ?? 0));
  }

  const drawdownDeRisked = riskInputs.currentDrawdown > config.drawdownThreshold;

  return {
    positions,
    grossExposure,
    netExposure,
    totalTurnover,
    riskAdjustments: adjustments,
    drawdownDeRisked,
  };
}
