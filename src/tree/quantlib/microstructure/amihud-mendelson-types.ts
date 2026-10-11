export interface AmihudMendelsonClientele {
  readonly horizon: number;
  readonly requiredReturn: number;
  readonly amortizedSpreadBps: number;
}

export interface AmihudMendelsonParams {
  readonly baseYield: number;
  readonly spreadPct: number;
  readonly investorHorizons: readonly number[];
  readonly amortizationFactor?: number;
}

export interface AmihudMendelsonResult {
  readonly clienteleReturns: readonly AmihudMendelsonClientele[];
  readonly equilibriumReturn: number;
  readonly liquidityPremiumBps: number;
  readonly optimalHoldingHorizon: number;
  readonly marginalSpreadElasticity: number;
}
