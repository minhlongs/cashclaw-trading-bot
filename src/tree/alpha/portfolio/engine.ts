import type { PortfolioConfig, PortfolioResult, RiskInputs } from './types';
import { baseWeights, applySequentialOverlays, type EngineScoredAlpha } from './engine-weights';
import { computePortfolioMetrics } from './engine-metrics';

export type { EngineScoredAlpha } from './engine-weights';

export function buildPortfolio(
  scoredAlphas: readonly EngineScoredAlpha[],
  currentWeights: ReadonlyMap<string, number>,
  riskInputs: RiskInputs,
  config: PortfolioConfig,
): PortfolioResult {
  const initial = baseWeights(scoredAlphas);
  const { weights, adjustments } = applySequentialOverlays(initial, currentWeights, riskInputs, config);
  const { positions, grossExposure, netExposure, totalTurnover } = computePortfolioMetrics(scoredAlphas, weights, currentWeights);
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
