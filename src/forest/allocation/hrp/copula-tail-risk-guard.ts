/**
 * @file copula-tail-risk-guard.ts
 * @description Clayton Copula asymmetric lower-tail dependence and liquidity CVaR estimation.
 */

import type { CopulaRiskMetrics } from './hrp-types';

export function calculateClaytonTailRisk(
  assetsKendallTau: number,
  baseCvar: number,
  illiquidityDiscount = 1.0,
): CopulaRiskMetrics {
  // Tau must be in [0, 1) for Clayton standard
  const tau = Math.max(0.01, Math.min(0.99, assetsKendallTau));
  
  // Kendall's Tau relative to Clayton parameter Theta: tau = theta / (theta + 2)
  // Therefore theta = 2*tau / (1 - tau)
  const theta = (2 * tau) / (1.0 - tau);
  
  // Clayton lower tail dependence is 2^(-1/theta)
  const lowerTailDependence = Math.pow(2.0, -1.0 / theta);
  
  // Copula CVaR adjustment: amplify base CVaR by tail dependence and illiquidity
  // Arbitrary modeling choice for penalization: CVaR * (1 + LTD * Illiquidity)
  const adjustedCvar = baseCvar * (1.0 + lowerTailDependence * illiquidityDiscount);
  
  return {
    claytonTheta: Math.round(theta * 10000) / 10000,
    lowerTailDependence: Math.round(lowerTailDependence * 10000) / 10000,
    portfolioLiquidityAdjustedCvar: Math.round(adjustedCvar * 10000) / 10000,
  };
}
