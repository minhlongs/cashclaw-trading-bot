export interface GatheralSchiedParams {
  readonly initialInventory: number;
  readonly initialPrice: number;
  readonly timeHorizon: number;
  readonly numSteps: number;
  readonly instantaneousImpact: number;
  readonly decayRate: number;
  readonly powerLawAlpha?: number;
  readonly riskAversion?: number;
}

export interface GatheralSchiedStep {
  readonly step: number;
  readonly time: number;
  readonly inventoryRemaining: number;
  readonly tradeSize: number;
  readonly tradeSpeed: number;
  readonly accumulatedImpact: number;
  readonly executionPrice: number;
  readonly stepCost: number;
}

export interface GatheralSchiedResult {
  readonly trajectory: readonly GatheralSchiedStep[];
  readonly totalCost: number;
  readonly vwapPrice: number;
  readonly terminalPrice: number;
  readonly isNoArbitrageGuaranteed: boolean;
  readonly priceReversionPath: readonly number[];
  readonly terminalInventory: number;
}
