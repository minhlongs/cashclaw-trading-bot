export interface BipowerJumpConfig {
  readonly returns: readonly number[];
  readonly significanceLevel?: number;
}

export interface BipowerJumpResult {
  readonly realizedVariance: number;
  readonly bipowerVariation: number;
  readonly jumpVariation: number;
  readonly relativeJumpRatio: number;
  readonly zScore: number;
  readonly hasSignificantJump: boolean;
  readonly sampleCount: number;
}
