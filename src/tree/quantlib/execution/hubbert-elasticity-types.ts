export interface HubbertElasticityParams {
  readonly totalShares: number;
  readonly numSteps: number;
  readonly elasticityAlpha: number; // Price elasticity of market depth: alpha in [0, 1)
  readonly baseResilience: number;  // Order book depth refill speed
  readonly timeStep?: number;
  readonly depthParameter?: number; // Base depth Q_0
}

export interface HubbertElasticityStep {
  readonly step: number;
  readonly tradeSize: number;
  readonly remainingShares: number;
  readonly effectiveElasticity: number;
  readonly stepCost: number;
}

export interface HubbertElasticityResult {
  readonly trajectory: readonly HubbertElasticityStep[];
  readonly expectedCost: number;
  readonly twapCost: number;
  readonly immediateCost: number;
  readonly liquiditySavings: number;
  readonly elasticityScalingFactor: number;
}
