import type { KyleCrossAssetParams, KyleCrossAssetResult } from './kyle-cross-asset-types';

export function computeKyleCrossAssetImpact(p: KyleCrossAssetParams): KyleCrossAssetResult {
  const m = p.assets.length;
  if (m === 0) {
    return { assets: [], lambdaMatrix: [], priceImpacts: [], eigenLiquidity: [], totalAdverseSelectionCost: 0 };
  }
  const rho = Math.max(-0.99, Math.min(0.99, p.crossAssetCorrelation));
  const lambdaMatrix: number[][] = Array.from({ length: m }, () => Array(m).fill(0));
  for (let i = 0; i < m; i++) {
    const sigVi = Math.sqrt(Math.max(1e-8, p.assetVariances[i] ?? 1e-4));
    const sigUi = Math.max(1e-6, p.noiseVolatilities[i] ?? 1);
    for (let j = 0; j < m; j++) {
      const sigVj = Math.sqrt(Math.max(1e-8, p.assetVariances[j] ?? 1e-4));
      const sigUj = Math.max(1e-6, p.noiseVolatilities[j] ?? 1);
      const corr = i === j ? 1 : rho;
      lambdaMatrix[i]![j] = 0.5 * corr * Math.sqrt((sigVi * sigVj) / (sigUi * sigUj));
    }
  }
  const priceImpacts: number[] = Array(m).fill(0);
  let totalCost = 0;
  for (let i = 0; i < m; i++) {
    for (let j = 0; j < m; j++) {
      const flow = p.orderFlows[j] ?? 0;
      priceImpacts[i] += lambdaMatrix[i]![j]! * flow;
    }
    const ownFlow = p.orderFlows[i] ?? 0;
    totalCost += priceImpacts[i]! * ownFlow;
  }
  const eigenLiquidity: number[] = Array(m).fill(0);
  for (let i = 0; i < m; i++) {
    const rowSum = lambdaMatrix[i]!.reduce((sum, v) => sum + Math.abs(v), 0);
    eigenLiquidity[i] = rowSum > 0 ? 1 / rowSum : 0;
  }
  return { assets: p.assets, lambdaMatrix, priceImpacts, eigenLiquidity, totalAdverseSelectionCost: totalCost };
}
