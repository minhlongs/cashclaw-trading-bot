export interface HighLowBar {
  readonly high: number;
  readonly low: number;
}

export interface CorwinSchultzConfig {
  readonly bars: readonly HighLowBar[];
  readonly clampNegativeSpread?: boolean;
}

export interface CorwinSchultzResult {
  readonly estimatedSpread: number;
  readonly estimatedSpreadBps: number;
  readonly meanAlpha: number;
  readonly meanBeta: number;
  readonly meanGamma: number;
  readonly pairCount: number;
}
