export interface AlfonsiFruthParams {
  readonly initialInventory: number;
  readonly initialPrice: number;
  readonly timeHorizon: number;
  readonly numSteps: number;
  readonly resilienceSpeed: number;
  readonly impactFactor: number;
  readonly shapeExponent?: number;
}

export interface AlfonsiFruthStep {
  readonly step: number;
  readonly time: number;
  readonly inventoryRemaining: number;
  readonly tradeSize: number;
  readonly instantaneousImpact: number;
  readonly relaxedImpact: number;
  readonly executionPrice: number;
  readonly stepCost: number;
}

export interface AlfonsiFruthResult {
  readonly trajectory: readonly AlfonsiFruthStep[];
  readonly totalCost: number;
  readonly vwapPrice: number;
  readonly terminalPrice: number;
  readonly resilienceRecoveryBps: number;
  readonly terminalInventory: number;
}
