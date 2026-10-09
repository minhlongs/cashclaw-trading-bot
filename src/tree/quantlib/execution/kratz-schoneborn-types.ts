export interface KratzSchonebornParams {
  readonly initialInventory: number;
  readonly initialPrice: number;
  readonly timeHorizon: number;
  readonly numSteps: number;
  readonly litTemporaryImpact: number;
  readonly litPermanentImpact: number;
  readonly darkArrivalRate: number;
  readonly darkFillProbability: number;
  readonly riskAversion?: number;
}

export interface KratzSchonebornStep {
  readonly step: number;
  readonly time: number;
  readonly inventoryRemaining: number;
  readonly litTradeSize: number;
  readonly darkTradeSize: number;
  readonly executionPrice: number;
  readonly stepCost: number;
}

export interface KratzSchonebornResult {
  readonly trajectory: readonly KratzSchonebornStep[];
  readonly totalCost: number;
  readonly vwapPrice: number;
  readonly terminalPrice: number;
  readonly darkCaptureRatio: number;
  readonly costSavingsVsPureLitBps: number;
  readonly terminalInventory: number;
}
