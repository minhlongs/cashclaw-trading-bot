import type { PortfolioPosition } from './types';
import type { EngineScoredAlpha } from './engine-weights';

export function computePortfolioMetrics(
  scoredAlphas: readonly EngineScoredAlpha[],
  weights: ReadonlyMap<string, number>,
  currentWeights: ReadonlyMap<string, number>,
): { positions: PortfolioPosition[]; grossExposure: number; netExposure: number; totalTurnover: number } {
  const positions: PortfolioPosition[] = scoredAlphas.map(({ alpha }) => ({
    alphaId: alpha.alphaId,
    targetWeight: weights.get(alpha.alphaId) ?? 0,
    turnover: Math.abs((weights.get(alpha.alphaId) ?? 0) - (currentWeights.get(alpha.alphaId) ?? 0)),
  }));

  let gross = 0, net = 0;
  for (const w of weights.values()) { gross += Math.abs(w); net += w; }

  const turnoverIds = new Set([...weights.keys(), ...currentWeights.keys()]);
  let totalTurnover = 0;
  for (const id of turnoverIds) {
    totalTurnover += Math.abs((weights.get(id) ?? 0) - (currentWeights.get(id) ?? 0));
  }
  return { positions, grossExposure: gross, netExposure: net, totalTurnover };
}
