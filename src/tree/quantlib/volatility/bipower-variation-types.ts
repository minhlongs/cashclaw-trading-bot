export interface BipowerVariationConfig {
  readonly minObservations?: number;
  readonly zCriticalThreshold?: number;
}

export interface BipowerVariationResult {
  readonly sampleCount: number;
  readonly realizedVariance: number;
  readonly bipowerVariation: number;
  readonly jumpVariation: number;
  readonly relativeJumpRatio: number;
  readonly jumpZScore: number;
  readonly hasSignificantJump: boolean;
}
