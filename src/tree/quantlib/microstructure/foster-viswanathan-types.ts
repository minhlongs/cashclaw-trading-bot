export interface FosterViswanathanParams {
  readonly numTraders: number;       // M >= 2
  readonly numRounds: number;        // N stages
  readonly priorVariance: number;    // Sigma_0 (variance of fundamental value)
  readonly noiseVariance: number;    // Sigma_u (variance of noise order flow)
  readonly signalCorrelation: number;// rho (correlation between traders' signals)
}

export interface FosterViswanathanStage {
  readonly round: number;
  readonly beta: number;             // Aggressiveness of informed traders
  readonly lambda: number;           // Kyle's lambda (market depth impact)
  readonly posteriorVariance: number;// Sigma_n (remaining uncertainty)
  readonly expectedVolume: number;   // Total order flow variance
}

export interface FosterViswanathanResult {
  readonly stages: readonly FosterViswanathanStage[];
  readonly totalInformationRevealed: number;
  readonly terminalUncertainty: number;
  readonly averageMarketDepth: number;
}
