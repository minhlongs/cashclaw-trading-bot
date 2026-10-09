export interface KyleSmoothImpactParams {
  readonly initialShares: number;
  readonly initialPrice: number;
  readonly timeHorizon: number;
  readonly numSteps: number;
  readonly dissipationRate?: number; // beta, default 2.0
  readonly impactParam?: number; // lambda, default 0.1
}

export interface KyleSmoothImpactStep {
  readonly step: number;
  readonly time: number;
  readonly sharesSold: number;
  readonly remainingShares: number;
  readonly executionPrice: number;
  readonly stepCost: number;
  readonly smoothImpact: number;
}

export interface KyleSmoothImpactResult {
  readonly trajectory: readonly KyleSmoothImpactStep[];
  readonly totalExecutionCost: number;
  readonly averageExecutionPrice: number;
  readonly terminalShares: number;
  readonly terminalImpact: number;
}
