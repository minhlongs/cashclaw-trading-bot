export interface TothFarmerImpactParams {
  readonly orderVolume: number;
  readonly dailyVolume: number;
  readonly volatility: number;
  readonly preFactor: number;
  readonly powerLawExponent: number;
  readonly decayTimeConstant: number;
  readonly evaluationSteps: number;
}

export interface TothFarmerRelaxationStep {
  readonly step: number;
  readonly timeElapsed: number;
  readonly decayFactor: number;
  readonly residualImpact: number;
}

export interface TothFarmerImpactResult {
  readonly instantaneousImpact: number;
  readonly peakImpact: number;
  readonly permanentResidualImpact: number;
  readonly participationRate: number;
  readonly decayTrajectory: readonly TothFarmerRelaxationStep[];
}
