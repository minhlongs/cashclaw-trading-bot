export interface GatheralBiarezConvexParams {
  readonly initialShares: number;
  readonly initialPrice: number;
  readonly timeHorizon: number;
  readonly numSteps: number;
  readonly convexExponent?: number;
  readonly impactParam?: number;
  readonly permImpactParam?: number;
}

export interface GatheralBiarezConvexStep {
  readonly step: number;
  readonly time: number;
  readonly sharesSold: number;
  readonly remainingShares: number;
  readonly executionPrice: number;
  readonly stepCost: number;
  readonly convexImpact: number;
}

export interface GatheralBiarezConvexResult {
  readonly trajectory: readonly GatheralBiarezConvexStep[];
  readonly totalExecutionCost: number;
  readonly averageExecutionPrice: number;
  readonly terminalShares: number;
  readonly terminalImpact: number;
}
