export interface RoughVolatilityConfig {
  readonly minObservations: number;
  readonly maxLag: number;
  readonly roughThreshold: number; // H < roughThreshold indicates rough regime (typically 0.45)
}

export interface RoughVolatilityResult {
  readonly hurstExponent: number; // Estimated Hurst exponent H
  readonly isRoughRegime: boolean; // True if H < roughThreshold (typically H ~ 0.1 in crypto)
  readonly fitQuality: number; // Linear regression R2 of the structure function
  readonly sampleCount: number;
}
