export interface BackBaruchParams {
  readonly timeHorizon: number;
  readonly numSteps: number;
  readonly priorVariance: number;
  readonly noiseVolatility: number;
  readonly fundamentalValue?: number;
}

export interface BackBaruchStep {
  readonly step: number;
  readonly time: number;
  readonly kyleLambda: number;
  readonly posteriorVariance: number;
  readonly traderAggressiveness: number;
  readonly priceDiscoveryEfficiency: number;
}

export interface BackBaruchResult {
  readonly trajectory: readonly BackBaruchStep[];
  readonly terminalVariance: number;
  readonly averageLambda: number;
  readonly finalDiscoveryEfficiency: number;
}
