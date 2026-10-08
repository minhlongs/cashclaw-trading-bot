// Copula Tail-Dependence Engine (Clayton Lower-Tail & Student-t Joint Crash)
import type { CopulaTailParams } from './stress-types';

export function calculateClaytonLowerTailDependence(theta: number): number {
  if (theta <= 0) {
    return 0; // Independence / no lower tail dependence
  }
  // For Clayton copula, lambda_L = 2^(-1 / theta)
  const lambdaLower = Math.pow(2, -1 / theta);
  return Number(lambdaLower.toFixed(6));
}

export function estimatePortfolioTailRiskMultiplier(
  params: CopulaTailParams,
  pairwiseCorrelations: readonly number[] = [],
): { lowerTailDependence: number; tailRiskMultiplier: number } {
  const lambdaL = calculateClaytonLowerTailDependence(params.claytonTheta);
  const avgCorr =
    pairwiseCorrelations.length > 0
      ? pairwiseCorrelations.reduce((a, b) => a + b, 0) / pairwiseCorrelations.length
      : 0.5;

  // Tail risk multiplier scales when lower tail dependence and correlation are elevated
  const tailRiskMultiplier = Number((1 + lambdaL * (1 + Math.max(0, avgCorr))).toFixed(4));

  return {
    lowerTailDependence: lambdaL,
    tailRiskMultiplier,
  };
}
