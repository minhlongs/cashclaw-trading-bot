export interface AssetMarketPrior {
  readonly symbol: string;
  readonly marketWeight: number;
  readonly equilibriumReturn: number;
  readonly variance: number;
}

export interface QualitativeAgentView {
  readonly symbol: string;
  readonly expectedReturn: number;
  readonly confidence: number;
  readonly viewDescription?: string;
}

export interface BlackLittermanConfig {
  readonly riskAversionDelta?: number;
  readonly tauPriorUncertainty?: number;
}

export interface BlackLittermanAssetResult {
  readonly symbol: string;
  readonly priorReturn: number;
  readonly posteriorReturn: number;
  readonly optimalWeight: number;
  readonly viewTiltPct: number;
}

export interface BlackLittermanResult {
  readonly assets: readonly BlackLittermanAssetResult[];
  readonly totalTiltL1: number;
  readonly averageConfidence: number;
}
