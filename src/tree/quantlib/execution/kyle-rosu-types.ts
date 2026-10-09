export interface KyleRosuParams {
  readonly fundamentalValue: number;
  readonly initialPrice: number;
  readonly timeHorizon: number;
  readonly numSteps: number;
  readonly volatility: number;
  readonly noiseTraderStd: number;
  readonly aggressivenessCoeff: number;
  readonly temporaryImpactCoeff: number;
  readonly initialInventory?: number;
}

export interface KyleRosuStep {
  readonly step: number;
  readonly time: number;
  readonly inventoryRemaining: number;
  readonly tradeSpeed: number;
  readonly tradeSize: number;
  readonly executionPrice: number;
  readonly priceDiscoveryIndex: number;
  readonly stepCost: number;
}

export interface KyleRosuResult {
  readonly trajectory: readonly KyleRosuStep[];
  readonly totalCost: number;
  readonly vwapPrice: number;
  readonly terminalPrice: number;
  readonly priceDiscoveryEfficiency: number;
  readonly terminalInventory: number;
}
