export interface HoldenSubrahmanyamParams {
  readonly numTraders: number;
  readonly numRounds: number;
  readonly priorVariance: number;
  readonly noiseVariance: number;
  readonly riskAversion: number;
}

export interface HoldenSubrahmanyamStage {
  readonly round: number;
  readonly beta: number;
  readonly lambda: number;
  readonly posteriorVariance: number;
  readonly priceEfficiency: number;
}

export interface HoldenSubrahmanyamResult {
  readonly stages: readonly HoldenSubrahmanyamStage[];
  readonly totalInformationRevealed: number;
  readonly terminalUncertainty: number;
  readonly averageMarketDepth: number;
}
