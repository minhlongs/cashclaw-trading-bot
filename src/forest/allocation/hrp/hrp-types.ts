/**
 * @file hrp-types.ts
 * @description Types for Hierarchical Risk Parity (HRP) and Copula Tail-Risk Desk.
 */

export interface DistanceMatrix {
  readonly assets: readonly string[];
  readonly distances: readonly number[][]; // N x N matrix
}

export interface ClusterNode {
  readonly id: number; // For leaves, id < N. For branches, id >= N.
  readonly left: ClusterNode | null;
  readonly right: ClusterNode | null;
  readonly distance: number;
  readonly constituentLeaves: readonly number[];
}

export interface HrpAllocation {
  readonly asset: string;
  readonly weight: number;
}

export interface CopulaRiskMetrics {
  readonly claytonTheta: number;
  readonly lowerTailDependence: number;
  readonly portfolioLiquidityAdjustedCvar: number; // CVaR scaled by tail dependence
}
