export interface HasbrouckVecmTick {
  readonly midPrice: number;
  readonly orderFlow: number; // Signed trade volume / innovation
  readonly spread?: number;
}

export interface HasbrouckVecmParams {
  readonly ticks: readonly HasbrouckVecmTick[];
  readonly cointegrationBeta?: number; // Normalized error correction parameter (default ~ 0.5)
  readonly lagCoeff?: number; // Autoregressive momentum coefficient (default ~ 0.2)
}

export interface HasbrouckVecmResult {
  readonly permanentPriceImpact: number;
  readonly transitoryPriceImpact: number;
  readonly errorCorrectionSpeed: number;
  readonly toxicityScore: number;
  readonly informationShare: number;
}
