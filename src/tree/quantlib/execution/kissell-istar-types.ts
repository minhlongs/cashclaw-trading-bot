export interface KissellIStarParams {
  readonly initialShares: number;
  readonly initialPrice: number;
  readonly timeHorizon: number;
  readonly numSteps: number;
  readonly dailyVolume?: number;
  readonly dailyVolatility?: number;
  readonly impactFactor?: number; // a1, default 0.25
  readonly sizeExponent?: number; // a2, default 0.50
  readonly volatilityExponent?: number; // a3, default 1.0
  readonly stepImpactFactor?: number; // b1, default 0.35
  readonly rateExponent?: number; // b2, default 0.50
}

export interface KissellIStarStep {
  readonly step: number;
  readonly time: number;
  readonly sharesSold: number;
  readonly remainingShares: number;
  readonly executionPrice: number;
  readonly stepCost: number;
  readonly instantaneousImpact: number;
  readonly cumulativePermanentImpact: number;
}

export interface KissellIStarResult {
  readonly trajectory: readonly KissellIStarStep[];
  readonly totalExecutionCost: number;
  readonly averageExecutionPrice: number;
  readonly terminalShares: number;
  readonly theoreticalIStar: number;
}
