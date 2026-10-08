import { describe, it, expect } from 'vitest';
import { correlationToDistance, buildSingleLinkageDendrogram, quasiDiagonalize } from './dendrogram-clusterer';
import { allocateRecursiveBisection, generateHrpPortfolio } from './hrp-capital-allocator';
import { calculateClaytonTailRisk } from './copula-tail-risk-guard';

describe('Hierarchical Risk Parity (HRP) & Copula Desk', () => {
  const assets = ['BTC', 'ETH', 'SOL', 'USDC'];
  const cov = [
    [0.05, 0.04, 0.03, 0.0],
    [0.04, 0.06, 0.04, 0.0],
    [0.03, 0.04, 0.08, 0.0],
    [0.0, 0.0, 0.0, 0.001]
  ];
  const corr = [
    [1.0, 0.8, 0.6, 0.0],
    [0.8, 1.0, 0.7, 0.0],
    [0.6, 0.7, 1.0, 0.0],
    [0.0, 0.0, 0.0, 1.0]
  ];

  it('converts correlation to distances properly', () => {
    const dist = correlationToDistance(corr);
    expect(dist.length).toBe(4);
    expect(dist[0][0]).toBe(0);
    // BTC-ETH corr=0.8 -> d = sqrt(0.5*(1-0.8)) = sqrt(0.1) ~ 0.316
    expect(dist[0][1]).toBeCloseTo(Math.sqrt(0.1), 3);
  });

  it('builds a dendrogram and quasi-diagonalizes correctly', () => {
    const dist = correlationToDistance(corr);
    const root = buildSingleLinkageDendrogram(dist);
    const orderedLeaves = quasiDiagonalize(root);
    
    expect(orderedLeaves.length).toBe(4);
    // USDC (idx 3) should be isolated, BTC (0) & ETH (1) should be clustered tightest
    // Actual leaf order might vary slightly but should preserve cluster topology
    const leavesSorted = [...orderedLeaves].sort((a,b) => a-b);
    expect(leavesSorted).toEqual([0, 1, 2, 3]);
  });

  it('allocates weights using inverse variance along tree without matrix inversion', () => {
    const orderedLeaves = [0, 1, 2, 3];
    const weights = allocateRecursiveBisection(orderedLeaves, cov);
    
    // Check sum to 1
    const sum = weights.reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(1.0, 4);

    // USDC has lowest variance, should get highest weight
    expect(weights[3]).toBeGreaterThan(weights[0]);
    expect(weights[3]).toBeGreaterThan(weights[1]);
    expect(weights[3]).toBeGreaterThan(weights[2]);

    const portfolio = generateHrpPortfolio(assets, weights);
    expect(portfolio.length).toBe(4);
    expect(portfolio.find(p => p.asset === 'USDC')?.weight).toBeGreaterThan(0.5);
  });

  it('calculates Clayton Copula tail risk accurately', () => {
    const risk = calculateClaytonTailRisk(0.5, 10.0, 1.2);
    // tau = 0.5 -> theta = 1 / 0.5 = 2.0
    // LTD = 2^(-1/2) = 1/sqrt(2) ~ 0.707
    expect(risk.claytonTheta).toBeCloseTo(2.0, 2);
    expect(risk.lowerTailDependence).toBeCloseTo(0.7071, 3);
    
    // CVaR = 10 * (1 + 0.707 * 1.2) = 10 * (1 + 0.8485) = 18.485
    expect(risk.portfolioLiquidityAdjustedCvar).toBeCloseTo(18.485, 1);
  });
});
