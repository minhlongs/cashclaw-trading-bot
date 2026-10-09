export interface GatheralSchiedResilientParams {
  readonly initialShares: number;
  readonly initialPrice: number;
  readonly timeHorizon: number;
  readonly numSteps: number;
  readonly temporaryImpact: number;
  readonly decayRate: number; // rho >= 0
  readonly decayExponent: number; // alpha in (0, 1]
  readonly impactPower?: number; // k (default 1.0)
}

export interface GatheralSchiedResilientStep {
  readonly step: number;
  readonly time: number;
  readonly sharesSold: number;
  readonly remainingShares: number;
  readonly executionPrice: number;
  readonly stepCost: number;
}

export interface GatheralSchiedResilientResult {
  readonly trajectory: readonly GatheralSchiedResilientStep[];
  readonly totalExecutionCost: number;
  readonly averageExecutionPrice: number;
  readonly terminalShares: number;
  readonly priceReversion: number;
}
