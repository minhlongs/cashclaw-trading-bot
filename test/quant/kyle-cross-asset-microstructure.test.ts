import { describe, it, expect } from 'vitest';
import { computeKyleCrossAssetImpact } from '@/tree/quantlib/microstructure/kyle-cross-asset-engine';
import type { KyleCrossAssetParams } from '@/tree/quantlib/microstructure/kyle-cross-asset-engine';

describe('Kyle-Caballe-Krishnan (1995) Multi-Asset Cross-Impact Microstructure Engine', () => {
  const baseParams: KyleCrossAssetParams = {
    assets: ['BTC', 'ETH', 'SOL'],
    assetVariances: [0.04, 0.09, 0.16],
    crossAssetCorrelation: 0.65,
    noiseVolatilities: [100, 80, 50],
    orderFlows: [50, 40, -20],
  };

  it('computes symmetric cross-asset lambda matrix and price impacts', () => {
    const result = computeKyleCrossAssetImpact(baseParams);
    expect(result.assets).toEqual(['BTC', 'ETH', 'SOL']);
    expect(result.lambdaMatrix.length).toBe(3);
    expect(result.lambdaMatrix[0]!.length).toBe(3);

    // Diagonal elements should be strictly positive
    expect(result.lambdaMatrix[0]![0]).toBeGreaterThan(0);
    expect(result.lambdaMatrix[1]![1]).toBeGreaterThan(0);
    expect(result.lambdaMatrix[2]![2]).toBeGreaterThan(0);

    // Off-diagonal cross-impact elements should reflect positive correlation
    expect(result.lambdaMatrix[0]![1]).toBeGreaterThan(0);
    expect(result.priceImpacts.length).toBe(3);
  });

  it('measures cross-asset spillover where order flow in one asset impacts others', () => {
    const soloBtcFlow = computeKyleCrossAssetImpact({
      ...baseParams,
      orderFlows: [100, 0, 0],
    });
    // Buying BTC moves BTC price up
    expect(soloBtcFlow.priceImpacts[0]).toBeGreaterThan(0);
    // Positive cross-asset correlation causes ETH and SOL prices to experience upward spillover
    expect(soloBtcFlow.priceImpacts[1]).toBeGreaterThan(0);
    expect(soloBtcFlow.priceImpacts[2]).toBeGreaterThan(0);
  });

  it('computes inverse depth eigen-liquidity metrics and adverse selection cost', () => {
    const result = computeKyleCrossAssetImpact(baseParams);
    expect(result.eigenLiquidity.length).toBe(3);
    for (const depth of result.eigenLiquidity) {
      expect(depth).toBeGreaterThan(0);
    }
    expect(Number.isFinite(result.totalAdverseSelectionCost)).toBe(true);
  });

  it('handles empty asset lists gracefully', () => {
    const emptyResult = computeKyleCrossAssetImpact({
      assets: [],
      assetVariances: [],
      crossAssetCorrelation: 0.5,
      noiseVolatilities: [],
      orderFlows: [],
    });
    expect(emptyResult.assets).toEqual([]);
    expect(emptyResult.lambdaMatrix).toEqual([]);
    expect(emptyResult.totalAdverseSelectionCost).toBe(0);
  });
});
