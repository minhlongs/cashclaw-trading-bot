export interface GatheralRoughExecutionParams {
  readonly initialShares: number;
  readonly initialPrice: number;
  readonly timeHorizon: number;
  readonly numSteps: number;
  readonly hurstParameter?: number;
  readonly impactParam?: number;
}

export interface GatheralRoughExecutionStep {
  readonly step: number;
  readonly time: number;
  readonly sharesSold: number;
  readonly remainingShares: number;
  readonly executionPrice: number;
  readonly stepCost: number;
  readonly roughImpact: number;
}

export interface GatheralRoughExecutionResult {
  readonly trajectory: readonly GatheralRoughExecutionStep[];
  readonly totalExecutionCost: number;
  readonly averageExecutionPrice: number;
  readonly terminalShares: number;
  readonly terminalImpact: number;
}
