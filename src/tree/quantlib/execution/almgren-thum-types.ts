export interface AlmgrenThumParams {
  readonly initialShares: number;
  readonly initialPrice: number;
  readonly timeHorizon: number;
  readonly numSteps: number;
  readonly dailyVolume?: number;
  readonly temporaryImpactFactor: number;
  readonly permanentImpactFactor?: number;
  readonly powerExponent?: number; // default ~0.6 (Citigroup empirical)
}

export interface AlmgrenThumStep {
  readonly step: number;
  readonly time: number;
  readonly sharesSold: number;
  readonly remainingShares: number;
  readonly executionPrice: number;
  readonly stepCost: number;
  readonly temporaryImpact: number;
  readonly permanentImpact: number;
}

export interface AlmgrenThumResult {
  readonly trajectory: readonly AlmgrenThumStep[];
  readonly totalExecutionCost: number;
  readonly averageExecutionPrice: number;
  readonly terminalShares: number;
  readonly permanentPriceImpact: number;
}
